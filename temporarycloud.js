var mongo=require('mongodb');

function temporarycloud(request,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var command=request.command||'';
	if (command=='setFile') {
		
		if (!permissions.set_temporarycloud_file) {
			callback({success:false,error:'You are not authorized to set temporary cloud files',authorization_error:true});
			return;
		}
		
		var key=request.key||'';
		var data=request.data||'';
		if (!key) {
			callback({success:false,error:'key is empty'});
			return;
		}
		if (!data) {
			callback({success:false,error:'data is empty'});
			return;
		}
		set_temporary_cloud_text(key,data,function(tmp) {
			callback(tmp);
		});
		/*
		var path=get_temporary_cloud_path();
		if (write_text_file(path+'/'+key+'.dat',data)) {
			write_text_file(path+'/'+key+'.'+(new Date()).getTime()+'.dat',data);
			callback({success:true});		
		}
		else {
			callback({success:false,error:'error writing file'});
			return;
		}
		*/
	}
	else if (command=='getFile') {
		var key=request.key||'';
		if (!key) {
			callback({success:false,error:'key is empty'});
			return;
		}
		get_temporary_cloud_text(key,function(tmp) {
			if (!tmp.success) {
				callback(tmp);
				return;
			}
			callback({success:true,data:tmp.text});
		});
		/*
		var path=get_temporary_cloud_path();
		var data=read_text_file(path+'/'+key+'.dat');
		if (data) {
			callback({success:true,data:data});		
		}
		else {
			callback({success:false,error:'error reading file'});
			return;
		}*/
	}
	else if (command=='downloadFile') {
		var req0=request;
		req0.command='getFile';
		temporarycloud(req0,function(tmp) {
			if (tmp.success) {
				tmp.response_type='download';
				tmp.contentType=req0.contentType||'text/plain';
				tmp.content=tmp.data;
				callback(tmp);
			}
			else callback(tmp);
		});
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}

function get_temporary_cloud_text(key,callback) {
	open_database(function(err,db) {
		if (err) {
			callback({success:false,error:err});
			return;
		}
		var CC=db.collection('text_files');
		CC.find({_id:key}).toArray(function(err,docs) {
			if ((err)||(docs.length===0)) {
				callback({success:false,error:'Error retrieving text.'});
				return;
			}
			callback({success:true,text:docs[0].text});
		});
	});
}
function set_temporary_cloud_text(key,text,callback) {
	open_database(function(err,db) {
		if (err) {
			callback({success:false,error:err});
			return;
		}
		var CC=db.collection('text_files');
		var CC2=db.collection('text_files_archive');
		CC.save({_id:key,text:text},function(err) {
			if (err) {
				callback({success:false,error:'Error setting text: '+err});
				return;
			}
			var timestamp=(new Date()).getTime();
			var timestamp_human=(new Date()).toString();
			CC2.save({_id:key+'-'+timestamp,key:key,timestamp:timestamp,timestamp_human:timestamp_human,text:text},function(err) {
				if (err) {
					callback({success:false,error:'Error setting text archive: '+err});
					return;
				}
				callback({success:true});
			});
		});
	});
}

function open_database(callback) {
	var db=new mongo.Db('temporarycloud', new mongo.Server('localhost',27017, {}), {safe:true});
	db.open(function(err,db) {
		if (err) {
			if (callback) callback(err,null);
		}
		else {
			if (callback) callback('',db);
		}
	});
}

function read_text_file(path) {
	try {
		return fs.readFileSync(path,'utf8');
	}
	catch(err) {
		console.error(err);
		return '';
	}
}

function write_text_file(path,txt) {
	var overwriting=false;
	try {
		if (fs.existsSync(path)) {
			overwriting=true;
			fs.renameSync(path,path+'.tmp');
		}
		fs.writeFileSync(path,txt);
		if (overwriting) {
			fs.unlinkSync(path+'.tmp');
		}
		return true;
	}
	catch(err) {
		if (overwriting) {
			fs.renameSync(path+'.tmp',path); //try to recover!
		}
		console.error(err);
		return false;
	}
}

function get_temporary_cloud_path() {
	var ret='/tmp/temporarycloud';
	mkdir(ret);
	return ret;
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

exports.temporarycloud=temporarycloud;
