var fs = require('fs');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;
var crypto = require('crypto');


function authentication(request,callback) {
	var command=request.command||'';
	var auth_path=wisdmconfig.wisdm_server.auth_path;
	if (!auth_path) {
		callback({success:false,error:'wisdmconfig.wisdm_server.auth_path is empty.'});
		return;
	}
	var path0=auth_path+'/active_sessions';
	mkdir(auth_path);
	mkdir(path0);
	if (command=='getAuthInfo') {
		
		var browser_code=request.browser_code||'';
		if (!browser_code) {
			callback({success:false,error:'browser_code is empty.'});
			return;
		}
		
		var fname=path0+'/'+browser_code+'.json';
		var ret=read_json_file(fname);
		if (ret.wisdm_authentication) {
			ret.wisdm_authentication.renew_timestamp=get_timestamp();
			ret.wisdm_authentication.renew_timestamp_human=(new Date()).toString();
			ret.user_id=ret.user_id||ret.wisdm_authentication.user;
			write_json_file(fname,ret);
		}
		if (ret.github_authentication) {
			ret.github_authentication.renew_timestamp=get_timestamp();
			ret.github_authentication.renew_timestamp_human=(new Date()).toString();
			ret.user_id=ret.user_id||ret.github_authentication.user+'@github';
			write_json_file(fname,ret);
		}
		if (ret.google_authentication) {
			ret.google_authentication.renew_timestamp=get_timestamp();
			ret.google_authentication.renew_timestamp_human=(new Date()).toString();
			ret.user_id=ret.user_id||ret.google_authentication.email;
			write_json_file(fname,ret);
		}
		ret.permissions=get_permissions(ret);
		ret.success=true;
		callback(ret);
	}
	else if (command=='authenticate') {
		var resource=request.resource||'';
		if (resource=='wisdm') {
			var user=request.user||'';
			var password=request.password||'';
			if ((!user)||(!password)) {
				callback({success:false,error:'Missing user or password.'});
				return;
			}
			authenticate_wisdm({user:user,password:password},function(tmp1) {
				if (tmp1.success) {
					var info={};
					var timestamp=get_timestamp();
					var timestamp_human=(new Date()).toString();
					info.wisdm_authentication={
						user:user,
						timestamp:timestamp,
						timestamp_human:timestamp_human,
						renew_timestamp:timestamp,
						renew_timestamp_human:timestamp_human
					};
					var browser_code=make_random_id(10);
					console.log ('Creating session: '+browser_code+'.json');
					if (write_json_file(path0+'/'+browser_code+'.json',info)) {
						callback({success:true,browser_code:browser_code});
					}
				}
				else {
					callback(tmp1);
				}
			});
		}
		else if (resource=='github') {
			authenticate_github(request,function(tmp1) {
				if (tmp1.success) {
					var info={};
					var timestamp=get_timestamp();
					var timestamp_human=(new Date()).toString();
					info.github_authentication={
						user:'unknown',
						timestamp:timestamp,
						timestamp_human:timestamp_human,
						renew_timestamp:timestamp,
						renew_timestamp_human:timestamp_human,
						access_token:tmp1.access_token
					};
					get_https_json({hostname:'api.github.com',path:'/user',auth:tmp1.access_token},function(tmp2) {
						if (!tmp2.success) {
							callback({success:false,error:'Problem getting user info from github: '+tmp2.error});
							return;
						}
						if (!tmp2.login) {
							callback({success:false,error:'Problem getting login field from github'});
							return;
						}
						var browser_code=make_random_id(10);
						console.log ('Creating session: '+browser_code+'.json');
						info.github_authentication.user=tmp2.login;
						info.github_authentication.user_data=tmp2;
						if (write_json_file(path0+'/'+browser_code+'.json',info)) {
							callback({success:true,browser_code:browser_code});
						}
					});
				}
				else {
					callback(tmp1);
				}
			});
		}
		else if (resource=='google') {
			console.log ('authenticate_google');
			authenticate_google(request,function(tmp1) {
				if (tmp1.success) {
					var info={};
					var timestamp=get_timestamp();
					var timestamp_human=(new Date()).toString();
					info.google_authentication={
						user:'unknown',
						timestamp:timestamp,
						timestamp_human:timestamp_human,
						renew_timestamp:timestamp,
						renew_timestamp_human:timestamp_human,
						access_token:tmp1.access_token
					};
					//See: http://stackoverflow.com/questions/20159782/how-can-i-decode-a-google-oauth-2-0-jwt-openid-connect-in-a-node-app
					
					var payload;
					try {
						var pieces=tmp1.id_token.split('.');
						for (var i=0; i<pieces.length; i++) {
							pieces[i]=new Buffer(pieces[i],'base64').toString('utf8');
						}
						payload=pieces[1];
						payload=JSON.parse(payload);
					}
					catch(err) {
						console.error(err);
						callback({success:false,error:'Problem parsing id token'});
						return;
					}
					if (!payload.email) {
						callback({success:false,error:'email field is missing'});
						return;
					}
					if (payload.email_veried=='true') {
						callback({success:false,error:'Email not verified on google account.'});
						return;
					}
					
					var browser_code=make_random_id(10);
					console.log ('Creating session: '+browser_code+'.json');
					info.google_authentication.email=payload.email;
					info.google_authentication.user_data=payload;
					if (write_json_file(path0+'/'+browser_code+'.json',info)) {
						callback({success:true,browser_code:browser_code});
					}
					else {
						callback({success:false,error:'Problem writing '+browser_code+'.json'});
					}
				}
				else {
					callback(tmp1);
				}
			});
		}
		else {
			callback({success:false,error:'Unknown resource: '+resource});
		}
	}
	else if (command=='getResourceAuthInfo') {
		if (request.resource=='github') {
			var url='https://github.com/login/oauth/authorize?';
			url+='client_id=a97fc04f1a89f77ba117';
			url+='&scope=user,repo,public_repo';
			callback({success:true,url:url});
		}
		else if (request.resource=='google') {
			var url='https://accounts.google.com/o/oauth2/auth?';
			url+='client_id=370386460124-a72s75fdj4mr48lr9l67g3g0l1ifirmu.apps.googleusercontent.com';
			url+='&response_type=code';
			url+='&scope=openid%20email';
			callback({success:true,url:url});
		}
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}


function get_https_text(options,callback) {
	
	var https = require('https');
	
	if (!options.port) options.port=443;
	if (!options.method) options.method='GET';
	if (!options.headers) options.headers={};
	if (!options.headers['user-agent']) {
		options.headers['user-agent']='WISDM';
	}
	var post_data='';
	if ((options.method=='POST')&&(options.query)) {
		post_data=require('querystring').stringify(options.query);
		options.headers['Content-Type']='application/x-www-form-urlencoded';
		options.headers['Content-Length']=post_data.length;
	}
	
	var req = https.request(options, function(res) {
		
		var text='';
		
		res.on('data', function(chunk) {
			text+=chunk;
		});
		res.on('end', function() {
			callback({success:true,text:text});
		});
	});
	
	if (post_data) req.write(post_data);
	
	
	req.end();
	
	req.on('error', function(e) {
		callback({success:false,error:e});
	});
}

function get_https_json(options,callback) {
	get_https_text(options,function(tmp1) {
		if (!tmp1.success) {
			callback(tmp1);
			return;
		}
		var ret={};
		try {
			ret=JSON.parse(tmp1.text);
		}
		catch(err) {
			callback({success:false,error:'Error parsing retrieved text: '+tmp1.text});
			return;
		}
		ret.success=true;
		callback(ret);
	});
}


function authenticate_github(request,callback) {
	var code=request.code||'';
	if (!code) {
		callback({success:false,error:'Code is empty!'});
		return;
	}

	var client_id=wisdmconfig.wisdm_server.github_client_id;
	var client_secret=wisdmconfig.wisdm_server.github_client_secret;
	//var redirect_uri:"http://wisdmhub.org";
	
	//var url='https://github.com
	var urlpath='/login/oauth/access_token?client_id='+client_id+'&client_secret='+client_secret+'&code='+code;
	get_https_text({hostname:'github.com',path:urlpath},function(tmp) {
		if (!tmp.success) {
			tmp.error='Problem getting access token: '+tmp.error;
			callback(tmp);
			return false;
		}
		var data=tmp.text;
		data=data.toString();
		try {
			var list=data.split('&');
			var response={};
			for (var i=0; i<list.length; i++) {
				var tmp=list[i].split('=');
				if (tmp.length==2) {
					response[tmp[0]]=tmp[1];
				}
			}
			if (response.access_token) {
				callback({success:true,access_token:response.access_token});
			}
			else {
				console.error(JSON.stringify(response)+' <- '+data);
				callback({success:false,error:data});
			}
		}
		catch(err) {
			console.error(err);
			callback({success:false,error:JSON.stringify(err)});
		}
	});

}

function authenticate_google(request,callback) {
	var code=request.code||'';
	if (!code) {
		callback({success:false,error:'Code is empty!'});
		return;
	}

	var client_id=wisdmconfig.wisdm_server.google_client_id;
	var client_secret=wisdmconfig.wisdm_server.google_client_secret;
	//var redirect_uri:"http://wisdmhub.org";
	
	//https://accounts.google.com/o/oauth2/token
	var urlpath='/o/oauth2/token';
	var query={
		client_id:client_id,
		client_secret:client_secret,
		grant_type:'authorization_code',
		code:code,
		redirect_uri:'http://wisdmhub.org/dev2/apps/wisdmauth/?mode=step2&resource=google'
	};
	get_https_json({hostname:'accounts.google.com',path:urlpath,method:'POST',query:query},function(tmp) {
		if (!tmp.success) {
			tmp.error='Problem getting access token: '+tmp.error;
			callback(tmp);
			return false;
		}
		if (tmp.error) {
			callback({success:false,error:tmp.error});
		}
		else {
			callback(tmp);
		}
	});

}

function periodic_cleanup() {
	var auth_path=wisdmconfig.wisdm_server.auth_path;
	if (!auth_path) {
		console.error('wisdmconfig.wisdm_server.auth_path is empty.');
	}
	else {
		var path0=auth_path+'/active_sessions';
		fs.readdir(path0,function(err,files) {
			if (err) {
				console.error(err);
			}
			else {
				for (var i=0; i<files.length; i++) {
					var tmp=read_json_file(path0+'/'+files[i]);
					var to_delete=true;
					if (tmp.wisdm_authentication) {
						var timestamp=tmp.wisdm_authentication.timestamp;
						var renew_timestamp=tmp.wisdm_authentication.renew_timestamp;
						var elapsed=get_timestamp()-timestamp;
						var elapsed_renew=get_timestamp()-renew_timestamp;
						if ((elapsed>=0)&&(elapsed<=60*120)&&(elapsed_renew>=0)&&(elapsed_renew<=60)) {
							to_delete=false;
						}
					}
					if (tmp.github_authentication) {
						var timestamp=tmp.github_authentication.timestamp;
						var renew_timestamp=tmp.github_authentication.renew_timestamp;
						var elapsed=get_timestamp()-timestamp;
						var elapsed_renew=get_timestamp()-renew_timestamp;
						if ((elapsed>=0)&&(elapsed<=60*240)&&(elapsed_renew>=0)&&(elapsed_renew<=240)) {
							to_delete=false;
						}
					}
					if (tmp.google_authentication) {
						var timestamp=tmp.google_authentication.timestamp;
						var renew_timestamp=tmp.google_authentication.renew_timestamp;
						var elapsed=get_timestamp()-timestamp;
						var elapsed_renew=get_timestamp()-renew_timestamp;
						if ((elapsed>=0)&&(elapsed<=60*240)&&(elapsed_renew>=0)&&(elapsed_renew<=240)) {
							to_delete=false;
						}
					}
					if (to_delete) {
						console.log ('Removing session: '+files[i]);
						fs.unlinkSync(path0+'/'+files[i]);
					}
				}
			}
		});
	}
	setTimeout(periodic_cleanup,30000);
}
setTimeout(periodic_cleanup,5000);

function make_random_id(numchars)
{
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for( var i=0; i < numchars; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
}

function authenticate_wisdm(params,callback) {
	var users_path=wisdmconfig.wisdm_server.users_path;
	var users=read_json_file(users_path).users||{};
	if (params.user in users) {
		var user_record=users[params.user];
		var hashed_password=user_record.hashed_password||'';
		var salt=user_record.salt||'';
		if (hashed_password) {
			var hash_compare=get_hashed_password(params.password,salt);
			if (hashed_password==hash_compare) {
				callback({success:true});
			}
			else {
				report_incorrect();
			}
		}
		else report_incorrect();
	}
	else report_incorrect();
	
	function report_incorrect() {
		callback({success:false,error:'Incorrect user or password'});
	}
	function get_hashed_password(password,salt) {
		return md5Sync(salt+password);
	}
	function md5Sync(str) {
		var md5sum=crypto.createHash('md5');
		md5sum.update(str);
		return md5sum.digest('hex');
	}
}

function get_timestamp() {
	return (new Date()).getTime()/1000; //number of seconds since the epoch
}

function read_json_file(path) {
	var txt;
	try {
		txt=fs.readFileSync(path,'utf8');
	}
	catch(err) {
		return {};
	}
	if (!txt) return {};
	try {
		return JSON.parse(txt);
	}
	catch(err2) {
		console.error('Error parsing json file: '+path,err2);
		return {};
	}
}

function write_json_file(path,obj) {
	try {
		fs.writeFileSync(path,JSON.stringify(obj));
		return true;
	}
	catch(err) {
		console.error(err);
		return false;
	}
}

function mkdir(path) {
	try {
		if (fs.existsSync(path)) {
			var sss=fs.statSync(path);
			if (sss.isDirectory()) return true;
			else {
				console.error('Problem in mkdir (1)');
				return false;
			}
		}
		fs.mkdirSync(path);
		return true;
	}
	catch(err) {
		console.error(err);
		return false;
	}
}

function get_permissions(auth_info) {
	var permissions={};
	var user_id=auth_info.user_id;
	if (user_id=='magland') {
		permissions.create_app=true;
		permissions.update_server_files=true;
		permissions.set_temporarycloud_file=true;
		permissions.save_map=true;
		permissions.submit_script=true;
	}
	else if (user_id) {
		permissions.create_app=false;
		permissions.update_server_files=false;
		permissions.set_temporarycloud_file=false;
		permissions.save_map=true;
		permissions.submit_script=true;
	}		
	return permissions;
}

exports.authentication=authentication;