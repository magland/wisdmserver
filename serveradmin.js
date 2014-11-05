var fs = require('fs');
var wisdmconfig=require('./wisdmconfig').wisdmconfig;
var crypto=require('crypto');

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
		var valid_projects=['wisdmserver','processingwebserver','processingnodeclient','processingsubnodeclient','filesystemclient','filesystemwebserver','tempfileserver','wisdmfileserver','vmriengine','wdapi'];
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
	else if (command=='setUserPassword') {
		if (!is_admin_user(request.auth_info.user_id)) {
			callback({success:false,error:'You are not authorized to set user passwords: '+request.auth_info.user_id,authorization_error:true});
			return;
		}
		try {
			var users=read_json_file(wisdmconfig.wisdm_server.users_path);
			if (!users.users) {
				callback({success:false,error:'Problem reading json file: '+wisdmconfig.wisdm_server.users_path});
				return;
			}
			var salt=make_random_id(16);
			var tmp={
				hashed_password:get_hashed_password(request.password,salt),
				salt:salt
			};
			users.users[request.user]=tmp;
			if (!write_json_file(wisdmconfig.wisdm_server.users_path,users)) {
				callback({success:false,error:'Problem writing json file.'});
				return;
			}
			callback({success:true});
		}
		catch(err) {
			console.log('########',JSON.stringify(err));
			callback({success:false,error:'Unexpected problem setting user password: '+JSON.stringify(err)});
			return;
		}
	}
	else if (command=='removeUser') {
		if (!is_admin_user(request.auth_info.user_id)) {
			callback({success:false,error:'You are not authorized to remove users: '+request.auth_info.user_id,authorization_error:true});
			return;
		}
		var users=read_json_file(wisdmconfig.wisdm_server.users_path);
		if (!users.users) {
			callback({success:false,error:'Problem reading json file: '+wisdmconfig.wisdm_server.users_path});
			return;
		}
		delete(users.users[request.user]);
		if (!write_json_file(wisdmconfig.wisdm_server.users_path,users)) {
			callback({success:false,error:'Problem writing json file.'});
			return;
		}
		callback({success:true});
	}
	else if (command=='getUsers') {
		if (!is_admin_user(request.auth_info.user_id)) {
			callback({success:false,error:'You are not authorized to get users: '+request.auth_info.user_id,authorization_error:true});
			return;
		}
		var users=read_json_file(wisdmconfig.wisdm_server.users_path);
		if (!users.users) {
			callback({success:false,error:'Problem reading json file: '+wisdmconfig.wisdm_server.users_path});
			return;
		}
		for (var user0 in users.users) {
			delete(users.users[user0].hashed_password);
			delete(users.users[user0].salt);
		}
		callback({success:true,users:users});
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
	function make_random_id(numchars) {
		var text = "";
		var possible = "abcdef0123456789";
		for( var i=0; i < numchars; i++ ) text += possible.charAt(Math.floor(Math.random() * possible.length));
		return text;
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
	function get_hashed_password(password,salt) {
		return md5Sync(salt+password);
	}
	function md5Sync(str) {
		var md5sum=crypto.createHash('md5');
		md5sum.update(str);
		return md5sum.digest('hex');
	}
	function is_admin_user(user0) {
		if (user0=='admin') return true;
		if (user0=='magland') return true;
		return false;
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
