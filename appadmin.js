var fs = require('fs');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;

function appadmin(request,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var command=request.command||'';
	if (command=='create_app') {
		
		if (!permissions.create_app) {
			callback({success:false,error:'You are not authorized to create apps',authorization_error:true});
			return;
		}
		
		var app_name=request.app_name||'';
		var files=request.files||[];
		if (!app_name) {
			callback({success:false,error:'app_name is empty'});
			return;
		}
		if (!files) {
			callback({success:false,error:'no files found'});
			return;
		}
		var path=get_app_path(app_name,true);
		if (!path) {
			callback({success:false,error:'Unable to make app path.'});
			return;
		}
		if (!clear_app_path(path)) {
			callback({success:false,error:'Unable to clear app path.'});
			return;
		}
		if (!write_app_files(path,files)) {
			callback({success:false,error:'Unable to write app files.'});
			return;
		}
		callback({success:true});		
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}



function get_app_path(app_name,do_create) {
	var dirname=wisdmconfig.wisdm_server.www_path;
	if (do_create) {
		if (!mkdir(dirname+'/dev2')) return false;
		if (!mkdir(dirname+'/dev2/apps')) return false;
		if (!mkdir(dirname+'/dev2/apps/'+app_name)) return false;
	}
	try {
		var sss=fs.statSync(dirname+'/dev2/apps/'+app_name);
		if (!sss.isDirectory()) return '';
		return dirname+'/dev2/apps/'+app_name;	
	}
	catch(err) {
		console.error(err);
		return '';
	}
}

function clear_app_path(path) {
	var tmp=wisdmconfig.wisdm_server.www_path;
	if ((!tmp)||(tmp.length<5)) return false; //safety
	if (path.indexOf(tmp)!==0) return false;
	
	var all_files;
	try {
		all_files=fs.readdirSync(path);
	}
	catch(err) {
		console.error(err);
		return false;
	}
	for (var i=0; i<all_files.length; i++) {
		var filePath=path+'/'+all_files[i];
		if (fs.statSync(filePath).isFile()) {
			try {
				fs.unlinkSync(filePath);
			}
			catch(err) {
				console.error(err);
			}
		}
		else {
			if (!clear_app_path(filePath)) return false;
			try {
				fs.rmdirSync(filePath);
			}
			catch(err) {
				console.error(err);
				return false;
			}
		}
	}
	all_files=fs.readdirSync(path);
	if (all_files.length>0) return false;
	return true;	
}

function write_app_files(path,files) {
	for (var filepath in files) {
		if (!write_app_file(path,filepath,files[filepath])) return false;
	}
	return true;
	function write_app_file(path,filepath,txt) {
		if (!create_app_file_path(path,filepath)) return false;
		try {
			fs.writeFileSync(path+'/'+filepath,txt);
		}
		catch(err) {
			console.error(err);
			return false;
		}
		return true;
	}

	function create_app_file_path(path,filepath) {
		if (!filepath) return true;
		var ind=filepath.indexOf('/');
		var filepath1,filepath2;
		if (ind>=0) {
			filepath1=filepath.slice(0,ind);
			filepath2=filepath.slice(ind+1);
		}
		else {
			filepath1=filepath;
			filepath2='';
		}
		if (!filepath2) return true;
		if (!mkdir(path+'/'+filepath1)) return false;
		return create_app_file_path(path+'/'+filepath1,filepath2);
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
	
exports.appadmin=appadmin;
