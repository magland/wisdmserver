var fs = require('fs');
var common=require('./common').common;

function is_legal_path(path) {
	if (path.indexOf("/..")>=0) return false;
	if (path.indexOf('/tmp/localfilesystem/')===0) return true;
	return false;
}

function append_path(basepath,relpath) {
	if (!basepath) return relpath;
	if (!relpath) return basepath;
	return basepath+'/'+relpath;
}

function get_file_path(path) {
	var ind=path.lastIndexOf('/');
	if (ind<0) return '';
	return path.slice(0,ind);
}

function get_file_tree(path,relpath,tree,callback) {
	fs.readdir(path,function(err,list) {
		if (err) {callback({success:false,error:err}); return;}
		common.for_each_async(list,function(item,cb) {
			fs.stat(append_path(path,item),function(err,stat) {
				if (err) {cb({success:false,error:err}); return;}
				if ((stat)&&(stat.isDirectory())) {
					if (item!='.git') {
						get_file_tree(append_path(path,item),append_path(relpath,item),tree,function(tmp1) {
							if (!tmp1.success) {cb(tmp1); return;}
							cb({success:true});
						});
					}
					else cb({success:true});
				}
				else {
					get_file_info(append_path(path,item),function(info0) {
						if (!info0.success) {cb(info0); return;}
						tree[append_path(relpath,item)]=info0;
						cb({success:true});
					});
				}
			});
		},function(tmp02) {
			callback(tmp02);
		},5);
	});
}

function get_file_names(path,callback) {
	var file_names=[];
	fs.readdir(path,function(err,list) {
		if (err) {callback({success:false,error:err}); return;}
		common.for_each_async(list,function(item,cb) {
			fs.stat(append_path(path,item),function(err,stat) {
				if (err) {cb({success:false,error:err}); return;}
				if ((stat)&&(!stat.isDirectory())) {
					file_names.push(item);
				}
				cb({success:true});
			});
		},function(tmp02) {
			file_names.sort();
			callback({success:true,file_names:file_names});
		},5);
	});
}

function get_folder_names(path,callback) {
	var folder_names=[];
	fs.readdir(path,function(err,list) {
		if (err) {callback({success:false,error:err}); return;}
		common.for_each_async(list,function(item,cb) {
			fs.stat(append_path(path,item),function(err,stat) {
				if (err) {cb({success:false,error:err}); return;}
				if ((stat)&&(stat.isDirectory())) {
					if (item!='.git') folder_names.push(item);
				}
				cb({success:true});
			});
		},function(tmp02) {
			folder_names.sort();
			callback({success:true,folder_names:folder_names});
		},5);
	});
}


function get_file_info(path,callback) {
	fs.stat(path,function(err,stats) {
		if (err) {callback({success:false,error:err}); return;}
		var info={};
		info.size=stats.size;
		info.last_modified=stats.mtime.getTime();
		common.get_file_checksum(path,function(tmp1) {
			if (!tmp1.success) {callback(tmp1); return;}
			info.checksum=tmp1.checksum;
			info.success=true;
			callback(info);
		});
	});
}

function compute_sha1(str) {
	var crypto=require('crypto');
	var ret=crypto.createHash('sha1');
	ret.update(str);
	return ret.digest('hex');
}


var spawn = require('child_process').spawn;
function run_process(exe,args,working_path,callback) {
	var spawned_process=spawn(exe,args,{cwd:working_path});
	
	var output='';
	
	spawned_process.stdout.on('data',function(data) {
		output+=data;
	});

	spawned_process.stderr.on('data', function (data) {
		output+=data;
	});
	
	spawned_process.on('close', function (code) {
		output+='Process exited with code ' + code;
		callback({success:true,output:output});
	});
}

function get_file_name(str) {
	if (!str) return '';
	var ind=str.lastIndexOf('/');
	if (ind>=0) return str.substr(ind+1);
	else return str;
}


function do_execute_git(args,working_dir,callback) {
	var exe="/usr/bin/git";
	run_process(exe,args,working_dir,function(tmp) {
		if (!tmp.success) {callback(tmp); return;}
		callback(tmp);
	});
}

function mkdir_sync(path) {
	try {
		fs.mkdirSync(path);
	}
	catch(err) {
	}
}

function localfilesystem(request,callback) {
	var command=request.command||'';
	var path=request.path||'';
	
	if (command=="getFileTree") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		var tree={};
		get_file_tree(path,'',tree,function(tmp) {
			if (!tmp.success) {callback(tmp); return;}
			callback({success:true,tree:tree});
		});
	}
	else if (command=="getFileNames") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		get_file_names(path,callback);
	}
	else if (command=="getFolderNames") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		get_folder_names(path,callback);
	}
	else if (command=="getFileText") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		common.read_text_file(path,callback);
	}
	else if (command=="setFileText") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		common.create_path(get_file_path(path),'/tmp/localfilesystem',function(tmp0) {
			if (!tmp0.success) {
				callback({success:false,error:'Problem creating path: '+get_file_path(path)});
				return;
			}
			common.write_text_file(path,request.text,function(tmp1) {
				if (!tmp1.success) {
					callback({success:false,error:'Problem in setFileText: '+tmp1.error});
					return;
				}
				callback(tmp1);
			});
		});
	}
	else if (command=="getFileData") {
		callback({success:false,error:'getFileData not yet implemented'});
	}
	else if (command=="setFileData") {
		callback({success:false,error:'setFileData not yet implemented'});
	}
	else if (command=="removeFile") {
		if (!is_legal_path(path)) {
			callback({success:false,error:'Illegal path: '+path});
			return;
		}
		fs.unlink(path,function(err) {
			if (err) {
				callback({success:false,error:'Problem removing file: '+err});
				return;
			}
			callback({success:true});
		});
	}
	else if (command=="initializeGit") {
		var url=request.url||'';
		var branch=request.branch||'';
		
		if (!branch) {
			callback({success:false,error:'branch is empty'});
			return;
		}
		
		var tmp={};
		tmp.url=url;
		tmp.branch=branch;
		var sign=compute_sha1(JSON.stringify(tmp));
		
		var tmppath='/tmp';
		mkdir_sync(tmppath+'/localfilesystem');
		mkdir_sync(tmppath+'/localfilesystem/git');
		mkdir_sync(tmppath+'/localfilesystem/git/'+sign);
		var dirname=tmppath+'/localfilesystem/git/'+sign;
		var dirname2=dirname+'/'+get_file_name(url);
		common.write_text_file(dirname+"/info.json",JSON.stringify(tmp),function(tmp1) {
			if (!tmp1.success) {callback({success:false,error:'Error creating info.json: '+tmp1.error}); return;}
			var error,output;
			var args=['clone',url,get_file_name(url)];
			if (!fs.existsSync(dirname2+'/.git')) {	
				do_execute_git(args,dirname,function(tmp2) {
					if (!tmp2.success) {callback({success:false,error:'Problem in clone step: '+tmp2.error,output:tmp2.output||''}); return;}
					step2();
				});
			}
			else {
				step2();
			}
		});
		
		function step2() {
			var output='';
			do_execute_git(['checkout',branch],dirname2,function(tmpA) {
				if (!tmpA.success) {callback({success:false,error:'Problem in checkout step: '+tmpA.error}); return;}
				output+=tmpA.output+'\n';
				do_execute_git(['fetch'],dirname2,function(tmpB) { //no origin?
					if (!tmpB.success) {callback({success:false,error:'Problem in fetch step: '+tmpB.error}); return;}
					output+=tmpB.output+'\n';
					do_execute_git(['reset','--hard','origin/'+branch],dirname2,function(tmpC) {
						if (!tmpC.success) {callback({success:false,error:'Problem in reset step: '+tmpC.error}); return;}
						output+=tmpC.output+'\n';
						do_execute_git(['clean','-f','-d'],dirname2,function(tmpD) {
							if (!tmpD.success) {callback({success:false,error:'Problem in clean step: '+tmpD.error}); return;}
							output+=tmpD.output+'\n';
							callback({success:true,path:dirname2,output:output});
						});
					});
				});
			});
		}
	}
	else if (command=="gitCommitAll") {
		
		var commit_message=request.commit_message||'';
		
		var output='';
		do_execute_git(['add','.'],path,function(tmpA) {
			if (!tmpA.success) {callback({success:false,error:'Problem in add step: '+tmpA.error}); return;}
			output+=tmpA.output+'\n';
			do_execute_git(['commit','-m',commit_message],path,function(tmpB) {
				if (!tmpB.success) {callback({success:false,error:'Problem in commit step: '+tmpB.error}); return;}
				output+=tmpB.output+'\n';
				do_execute_git(['push','origin'],path,function(tmpC) {
					if (!tmpC.success) {callback({success:false,error:'Problem in push step: '+tmpC.error}); return;}
					output+=tmpC.output+'\n';
					callback({success:true,output:output});
				});
			});
		});		
		
	}
	else {
		callback({success:false,error:'Unexpected or missing command: '+command});
	}
}

exports.localfilesystem=localfilesystem;