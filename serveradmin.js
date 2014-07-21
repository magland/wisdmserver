var fs = require('fs');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;

function serveradmin(request,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var command=request.command||'';
	if (command=='update_server_files') {
		if (!permissions.update_server_files) {
			callback({success:false,error:'You are not authorized to update server files',authorization_error:true});
			return;
		}
		var files=request.files||[];
		if (!files) {
			callback({success:false,error:'no files found'});
			return;
		}
		var project=request.project||'';
		var valid_projects=['wisdmserver','processingwebserver','processingnodeclient','processingsubnodeclient','filesystemclient','filesystemwebserver','tempfileserver','wisdmfileserver'];
		if (valid_projects.indexOf(project)<0) {
			callback({success:false,error:'Invalid project: '+project});
			return;
		}
		if (!project) {
			callback({success:false,error:'project is empty'});
			return;
		}
		var path=wisdmconfig.wisdm_server.server_source_path+'/'+project;
		if (!update_server_files(path,files)) {
			callback({success:false,error:'Unable to update server files.'});
			return;
		}
		callback({success:true});		
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}

function update_server_files(path,files) {
	for (var filepath in files) {
		if (!update_server_file(path,filepath,files[filepath])) return false;
	}
	return true;
	function update_server_file(path,filepath,txt) {
		if (!mkdir(path)) return false;
		if (!create_server_file_path(path,filepath)) return false;
		try {
			fs.writeFileSync(path+'/'+filepath,txt);
		}
		catch(err) {
			console.error(err);
			return false;
		}
		return true;
	}

	function create_server_file_path(path,filepath) {
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
		return create_server_file_path(path+'/'+filepath1,filepath2);
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
}

exports.serveradmin=serveradmin;
