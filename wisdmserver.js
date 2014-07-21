var wisdmconfig=require('./wisdmconfig').wisdmconfig;
var WISDMUSAGE=require('../processingnodeclient/src/wisdmusage').WISDMUSAGE;
WISDMUSAGE.startPeriodicWritePendingRecords();
WISDMUSAGE.setCollectionName('wisdmserver');
var common=require('./common').common;

/*
if (wisdmconfig.processing_node.node_id) {
	var ProcessingNodeClient=require('./processingnodeclient').ProcessingNodeClient;
	
	setTimeout(function() {
		var CC=new ProcessingNodeClient();
		CC.setProcessingNodeId(wisdmconfig.processing_node.node_id);
		CC.setNodePath(wisdmconfig.processing_node.node_path);
		console.log ('Initializing process database...');
		CC.initializeProcessDatabase(function(tmp) {
			if (tmp.success) {
				console.log ('Process database initialized.');
			}
			else {
				console.log ('Error initializing process database: '+tmp.error);
			}
		});
		console.log ('Connecting to server...');
		CC.connectToServer(wisdmconfig.processing_node.server_host,wisdmconfig.processing_node.server_port,function(tmp) {
			if (tmp.success) {
				console.log ('Connected to server.');
			}
			else {
				console.log ('Error connecting to server: '+tmp.error);
			}
		});
	},3000);
}
*/


if (wisdmconfig.wisdm_server.listen_port) {

	var sys = require ('sys'),
	url = require('url'),
	http = require('http'),
	qs = require('querystring');
	
	require('./authentication'); //get the periodic cleanup going
	
	function on_request(request,callback) {
		console.log ('REQUEST:::: '+request.service+' '+request.command);
		
		request.auth_info={};
		if (request.browser_code) {
			require('./authentication').authentication({
				service:'authentication',
				command:'getAuthInfo',
				browser_code:request.browser_code
			},function(tmp1) {
				if (tmp1.success) {
					request.auth_info=tmp1;
				}
				on_request_part2();
			});
		}
		else on_request_part2();
		
		
		function on_request_part2() {
			
			var user_id=(request.auth_info||{}).user_id;
			WISDMUSAGE.addRecord({
				user_id:user_id||'unknown.'+request.remoteAddress,
				usage_type:'request_bytes',
				amount:JSON.stringify(request).length,
				name:request.command||''
			});
			
			
			var service=request.service||'';
			if (service=='appadmin') {
				require('./appadmin').appadmin(request,finalize);
			}
			else if (service=='config') {
				if (request.command=='getConfig') {
					finalize({success:true,processingwebserver_url:wisdmconfig.wisdm_server.processingwebserver_url});
				}
				else {
					finalize({success:false,error:'Unknown command *: '+request.command});
				}
			}
			else if (service=='serveradmin') {
				require('./serveradmin').serveradmin(request,finalize);
			}
			else if (service=='temporarycloud') {
				require('./temporarycloud').temporarycloud(request,finalize);
			}
			else if (service=='maps') {
				require('./maps').maps(request,finalize);
			}
			else if (service=='authentication') {
				require('./authentication').authentication(request,finalize);
			}
			else if (service=='processing') {
				finalize({success:false,error:'This web server can no longer handle processing requests'});
				//processing(request,finalize);
			}
			else if (service=='localfilesystem') {
				require('./localfilesystem').localfilesystem(request,finalize);
			}
			else if (service=='usage') {
				require('./usage').usage(request,finalize);
			}
			else {
				finalize({success:false,error:'Unknown service: '+service});
			}
			
			function finalize(tmp) {
				WISDMUSAGE.addRecord({
					user_id:user_id||'unknown.'+request.remoteAddress,
					usage_type:'response_bytes',
					amount:JSON.stringify(tmp).length,
					name:request.command||''
				});
				if (callback) callback(tmp);
			}
			
		}
		
	}
	
	var static0=require('node-static');
	var fileServer=new static0.Server(wisdmconfig.wisdm_server.www_path);
	
	http.createServer(function (REQ, RESP) {
		var remote_address=REQ.connection.remoteAddress;
		if (REQ.method == 'OPTIONS') {
			var headers = {};
			// IE8 does not allow domains to be specified, just the *
			// headers["Access-Control-Allow-Origin"] = req.headers.origin;
			headers["Access-Control-Allow-Origin"] = "*";
			headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
			headers["Access-Control-Allow-Credentials"] = false;
			headers["Access-Control-Max-Age"] = '86400'; // 24 hours
			headers["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
			RESP.writeHead(200, headers);
			RESP.end();
		}
		else if(REQ.method=='POST') {
			var body='';
			REQ.on('data', function (data) {
				body+=data;
			});
			REQ.on('end',function(){
				var POST =  body;
				try {
					var req0=JSON.parse(POST);
					req0.remoteAddress=remote_address;
					on_request(req0,function(resp) {
						send_response(resp);
					});
				}
				catch(err) {
					console.error(JSON.parse(err));
					error_log(JSON.parse(err));
					send_response({success:false,error:JSON.stringify(err)});
				}
			});
		}
		else if(REQ.method=='GET') {
			var url_parts = url.parse(REQ.url,true);
			if (url_parts.pathname=='/wisdmserver') {
				var req0=url_parts.query;
				req0.remoteAddress=remote_address;
				on_request(url_parts.query,function(resp) {
					send_response(resp);
				});
			}
			else {
				//question: why do they have the .addListener functionality in the example on node.js?
				//REQ.addListener('end',function() {
					fileServer.serve(REQ,RESP);
				//});
				
				var previous_bytes_written=(REQ.socket||{}).bytesWritten||0;
				RESP.on('finish',function() {
					var bytes_written=(REQ.socket||{}).bytesWritten||0;
					bytes_written-=previous_bytes_written;
					if (bytes_written>0) {
						WISDMUSAGE.addRecord({
							user_id:'unknown.'+remote_address,
							usage_type:'file_server_bytes',
							amount:bytes_written,
							name:common.get_file_suffix(url_parts.pathname)
						});
					}
				});
			}
		}
		
		function send_response(obj) {
			if (!obj.response_type) {
				RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":"application/json"});
				RESP.end(JSON.stringify(obj));
			}
			else if (obj.response_type=='download') {
				RESP.writeHead(200, {"Access-Control-Allow-Origin":"*", "Content-Type":obj.contentType});
				RESP.end(obj.content);
			}
		}
		
	}).listen(wisdmconfig.wisdm_server.listen_port);
	
	/*
	var fs = require('fs');
	var ProcessingNodeServer=require('./processingnodeserver').ProcessingNodeServer;
	var wisdmconfig=require('./wisdmconfig').wisdmconfig;
	
	function processing(request,callback) {
		var permissions=(request.auth_info||{}).permissions||{};
		var processing_node_id=request.processing_node_id||'';
		
		if (!processing_node_id) {
			callback({success:false,error:'Missing parameter: processing_node_id'});
			return;
		}
		var NN=NODESERVER.findProcessingNodeConnection(processing_node_id);
		if (!NN) {
			callback({success:false,error:'Unable to find processing node: '+processing_node_id});
			return;
		}
		
		if ((request.command||'')=='checkNodeConnected') {
			callback({success:true});
			return;
		}
		
		NN.processRequest(request,callback);
	}
	
	var NODESERVER=new ProcessingNodeServer();
	NODESERVER.startListening(wisdmconfig.processing_server.listen_port);
	*/
}

function error_log(str) {
	fs.appendFile('ERRORS.txt',str,function(err) {
		console.error('Error writing to ERRORS.txt - oh boy!');
	});
}


