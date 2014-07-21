
var ObjectID=require('mongodb').ObjectID;
var common=require('./common').common;
var MapTransferHandler=require('./maptransferhandler').MapTransferHandler;

var maps_waiting_for_contents_by_code={};
var DATABASE=require('./databasemanager').DATABASE;

/*function add_contents_to_map(map,contents_needed_by_checksum) {
	var ret=true;
	if ('content' in map) {
		if ((typeof(map.content)=='object')&&('checksum' in map.content)) {
			if (map.content.checksum in contents_needed_by_checksum) {
				var content0=contents_needed_by_checksum[map.content.checksum];
				map.content=content0;
			}
			else ret=false;
		}
	}
	for (var key in map) {
		if (typeof(map[key])=='object') {
			if (!add_contents_to_map(map[key],contents_needed_by_checksum)) {
				ret=false;
			}
		}
	}
	return ret;
}*/

/*function get_checksums_for_contents_needed(map,checksums) {
	if ('content' in map) {
		if ((typeof(map.content)=='object')&&('checksum' in map.content)) {
			checksums.push(map.content.checksum);
		}
	}
	for (var key in map) {
		if (typeof(map[key])=='object') {
			get_checksums_for_contents_needed(map[key],checksums);
		}
	}
	return true;
}*/

/*function get_contents_by_checksum_from_database(checksums,callback) {
	var ret={};
	open_database({},function(err,db) {
		if (err) {console.error('Error opening database (43)'); return;}
		var CC=db.collection('contents_by_checksum');
		common.for_each_async(checksums,function(checksum,cb) {
			CC.find({checksum:checksum},{content:1}).toArray(function(err,docs) {
				if (err) {
					cb({success:false,error:'Problem in find (49): '+err});
					return;
				}
				if (docs.length>0) {
					ret[checksum]=docs[0].content;
				}
				CC.update({checksum:checksum},{$set:{last_accessed:(new Date()).getTime()}},function(err) {
					if (err) {
						cb({success:false,error:'Problem updating last_accessed: '+err});
						return;
					}
					cb({success:true});
				});
			});
		},function(tmpDD) {
			db.close();
			if (!tmpDD.success) {
				callback(tmpDD);
				return;
			}
			callback({success:true,contents_by_checksum:ret});
		},5);
	});
}*/

function get_map_access(params,callback) {
	var DB=DATABASE('maps');
	DB.setCollection('maps');
	DB.find({name:params.name,owner:params.owner},{access:1,timestamp:1},function(err,docs) {
		if (err) {
			callback({success:false,error:err});
			return;
		}
		docs.sort(function(a,b) {
			if (a.timestamp<b.timestamp) return 1;
			else if (a.timestamp>b.timestamp) return -1;
			else return 0;
		});
		if (docs.length===0) {
			callback({success:false,error:'Map not found'});
			return;
		}
		callback({success:true,access:docs[0].access||{}});
	});
}

function maps(request,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var user_id=(request.auth_info||{}).user_id||'';
	var command=request.command||'';
	var name=request.name||'';
	var owner=request.owner||user_id;
	
	if ((name)&&(owner)) {
		get_map_access({name:name,owner:owner},function(tmp1) {
			maps_part_2(request,tmp1.access||{},callback);
		});
	}
	else {
		maps_part_2(request,{},callback);
	}
}

function can_set_map(owner,access,user_id) {
	if (user_id==owner) return true;
	if ((access.edit_users||[]).indexOf(user_id)>=0) return true;
	if ((access.edit_users||[]).indexOf('public')>=0) return true;
	return false;
}
function can_delete_map(owner,access,user_id) {
	if (user_id==owner) return true;
	if ((access.edit_users||[]).indexOf(user_id)>=0) return true;
	return false;
}
function can_read_map(owner,access,user_id) {
	if ((user_id)&&(user_id!='public')) {
		if (user_id==owner) return true;
		if ((access.edit_users||[]).indexOf(user_id)>=0) return true;
		if ((access.read_users||[]).indexOf(user_id)>=0) return true;
	}
	if ((access.edit_users||[]).indexOf('public')>=0) return true;
	if ((access.read_users||[]).indexOf('public')>=0) return true;
	return false;
}
	
function maps_part_2(request,access,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var user_id=(request.auth_info||{}).user_id||'';
	var command=request.command||'';
	var name=request.name||'';
	var owner=request.owner||user_id;
	
	if ((command=='setMap')||(command=='setMap_send_contents')) {
		var data=request.data||null;
		
		var MMM=new MapTransferHandler();
		
		if (!permissions.save_map) {
			callback({success:false,error:'You are not authorized to save maps',authorization_error:true});
			return;
		}
		
		if (!can_set_map(owner,access,user_id)) {
			callback({success:false,error:'You are not authorized to save this map'});
			return;
		}
		
		if (!name) {
			callback({success:false,error:'name is empty'});
			return;
		}
		
		if (!owner) {
			callback({success:false,error:'owner ssis empty'});
			return;
		}
		
		var code=name+':::'+owner;
		
		if (command=='setMap') {
			//the client is setting the map
			if (!data) {
				callback({success:false,error:'data is empty'});
				return;
			}
			//checksums_for_contents_needed = all the content checksums in the map (i.e. for missing contents)
			var checksums_for_contents_needed=[];
			MMM.getChecksumsFromMap(data,checksums_for_contents_needed);
			if (checksums_for_contents_needed.length>0) {
				
				//first we check in the database to see which contents we already have
				var DB=DATABASE('maps');
				DB.setCollection('maps');
				MMM.getChecksumsInDatabase(DB,checksums_for_contents_needed,function(tmpDD) {
				//MMM.getContentsByChecksumFromDatabase(DB,checksums_for_contents_needed,function(tmpCC) {
					//if (!tmpCC.success) {
					//	callback({success:false,error:'Problem (72): '+tmpCC.error});
					//	return;
					//}
					if (!tmpDD.success) {
						callback({success:false,error:'Problem (192): '+tmpDD.error});
						return;
					}
					
					//now we add the contents to the map (later we will skip this step)
					//MMM.addContentsToMap(data,tmpCC.contents_by_checksum);
					
					//new_checksums_for_contents_needed = the checksums we don't already have in the database
					var new_checksums_for_contents_needed=[];
					checksums_for_contents_needed.forEach(function(checksum) {
						if (!(checksum in tmpDD.checksums))
							new_checksums_for_contents_needed.push(checksum);
					});
					
					if (new_checksums_for_contents_needed.length>0) {
						//we send back a request for the additional contents, and put the data into the maps_waiting_for_contents_by_code
						var tmp00={};
						tmp00.success=true;
						tmp00.owner=owner;
						tmp00.checksums_for_contents_needed=new_checksums_for_contents_needed;
						
						maps_waiting_for_contents_by_code[code]=data;
						callback(tmp00);
					}
					else {
						//if we don't need any additional contents, we can just set the map
						set_map({name:name,data:data,owner:owner},function(tmp) {
							tmp.owner=owner;
							callback(tmp);
						});
					}
				});
			}
			else {
				//if there are no checksums to handle, we just set the map
				set_map({name:name,data:data,owner:owner},function(tmp) {
					tmp.owner=owner;
					callback(tmp);
				});
			}
		}
		else if (command=='setMap_send_contents') {
			//the client is sending the missing contents corresponding to previous call to 'setMap'
			var contents_needed_by_checksum=request.contents_needed_by_checksum;
			if (!(code in maps_waiting_for_contents_by_code)) {
				callback({success:false,error:'Unexpected problem: code not found in waiting maps: '+code});
				return;
			}
			var map=maps_waiting_for_contents_by_code[code];
			delete(maps_waiting_for_contents_by_code[code]);
			//we add the contents to the map - we can skip this step in the future
			/*if (!MMM.addContentsToMap(map,contents_needed_by_checksum)) {
				callback({success:false,error:'Problem adding contents to map.'});
				return;
			}*/
			//let's add the new contents to the database
			var DB=DATABASE('maps');
			DB.setCollection('maps');
			MMM.setContentsByChecksumToDatabase(DB,contents_needed_by_checksum,function(tmpJJ) {
				if (!tmpJJ.success) {
					callback({success:false,error:'Problem setting contents to database: '+tmpJJ.error});
					return;
				}
				//finally we set the map
				set_map({name:name,data:map,owner:owner},function(tmp) {
					tmp.owner=owner;
					callback(tmp);
				});
			});
		}
	}
	else if (command=='deleteMap') {
		if (!permissions.save_map) {
			callback({success:false,error:'You are not authorized to delete maps',authorization_error:true});
			return;
		}
		
		if (!can_delete_map(owner,access,user_id)) {
			callback({success:false,error:'You are not authorized to delete this map'});
			return;
		}
		
		if (!name) {
			callback({success:false,error:'name is empty'});
			return;
		}
		if (!owner) {
			callback({success:false,error:'owner is empty'});
			return;
		}
		delete_map({name:name,owner:owner},function(tmp) {
			callback(tmp);
		});
	}
	else if (command=='getMap') {
		if (!name) {
			callback({success:false,error:'name is empty'});
			return;
		}
		if (!owner) {
			callback({success:false,error:'owner is empty'});
			return;
		}
		
		if (!can_read_map(owner,access,user_id)) {
			callback({success:false,error:'You are not authorized to read this map',authorization_error:true});
			return;
		}
		
		find_most_recent_map({name:name,owner:owner},function(tmp) {
			if (!tmp.success) {callback(tmp); return;}
			if (request.response_type=='download') {
				if (!tmp.success) {
					callback(tmp);
					return false;
				}
				
				var MMM=new MapTransferHandler();
				var checksums_for_contents_needed=[];
				MMM.getChecksumsFromMap(tmp.data,checksums_for_contents_needed);
				if (checksums_for_contents_needed.length>0) {
					//first we check in the database to see which contents we already have
					var DB=DATABASE('maps');
					DB.setCollection('maps');
					MMM.getContentsByChecksumFromDatabase(DB,checksums_for_contents_needed,function(tmpCC) {
						if (!tmpCC.success) {
							callback({success:false,error:'Problem (317): '+tmpCC.error});
							return;
						}
						MMM.addContentsToMap(tmp.data,tmpCC.contents_by_checksum);
						var resp={};
						resp.response_type='download';
						resp.contentType='application/json';
						resp.content=JSON.stringify(tmp.data);
						callback(resp);
					});
				}
				else {
					var resp={};
					resp.response_type='download';
					resp.contentType='application/json';
					resp.content=JSON.stringify(tmp.data);
					callback(resp);
				}
			}
			else {
				var map=tmp.data;
				
				var MMM=new MapTransferHandler();
				
				var contents_by_checksum={};
				MMM.replaceLargeContentsWithChecksums(map,contents_by_checksum);
				
				var DB=DATABASE('maps');
				DB.setCollection('maps');
				MMM.setContentsByChecksumToDatabase(DB,contents_by_checksum,function(tmpHH) {
					if (!tmpHH.success) {
						callback({success:false,error:'Problem setting contents to database: '+tmpHH.error});
						return;
					}
					callback(tmp);
				});
			}
		});
	}
	else if (command=='getMapNodeContent') {
		if (!name) {
			callback({success:false,error:'name is empty'});
			return;
		}
		if (!owner) {
			callback({success:false,error:'owner is empty'});
			return;
		}
		var path=request.path||'';
		if (!path) {
			callback({success:false,error:'path is empty'});
			return;
		}
		
		if (!can_read_map(owner,access,user_id)) {
			callback({success:false,error:'You are not authorized to read this map',authorization_error:true});
			return;
		}
		
		find_most_recent_map({name:name,owner:owner},function(tmp) {
			if (!tmp.success) {callback(tmp); return;}
			var map=tmp.data;
			var N=find_node_from_path(path,map.root);
			if (!N) {
				callback({success:false,error:'Unable to find node'});
				return;
			}
			if ((N.attachment)&&(N.attachment.content)) {
				var content=N.attachment.content;
				if ((is_object(content))&&('checksum' in content)) {
					var MMM=new MapTransferHandler();
					var DB=DATABASE('maps');
					MMM.getContentsByChecksumFromDatabase(DB,[content.checksum],function(tmpGG) {
						if (!tmpGG.success) {callback(tmpGG); return;}
						callback({success:true,content:tmpGG.contents_by_checksum[content.checksum]});
					});
				}
				else {
					callback({success:true,content:content});
					return;
				}
			}
			else {
				callback({success:true,content:''});
				return;
			}
		});
	}
	else if (command=='getMap_retrieve_contents') {
		
		/*if (!can_read_map(owner,access,user_id)) {
			callback({success:false,error:'You are not authorized to read this map *: '+JSON.stringify(access)+': '+owner+': '+user_id});
			return;
		}*/
		
		var MMM=new MapTransferHandler();
		var DB=DATABASE('maps');
		DB.setCollection('maps');
		MMM.getContentsByChecksumFromDatabase(DB,request.checksums_needed,function(tmpFF) {
			if (!tmpFF.success) {callback(tmpFF); return;}
			callback({success:true,contents_by_checksum:tmpFF.contents_by_checksum});
		});
	}
	else if (command=='getAllMaps') {
		/*if (!owner) {
			callback({success:false,error:'owner is empty'});
			return;
		}*/
		get_all_maps({user_id:user_id},function(tmp) {
			callback(tmp);
		});
	}
	else if (command=='mergeWithRemote') {
		if (user_id!='magland') {
			callback({success:false,error:'You are not authorized to merge with remote database.',authorization_error:true});
			return;
		}
		merge_with_remote(request,callback);
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}

function is_object(X) {
	if (!X) return false;
	return (typeof(X)=='object');
}
function find_node_from_anchor(anchor_name,start_node) {
	if (anchor_name=='ROOT') return start_node;
	if ((start_node.title||'')==anchor_name+':') {
		return start_node;
	}
	var ret=null;
	(start_node.children||[]).forEach(function(child_node) {
		if (!ret) {
			var tmp=find_node_from_anchor(anchor_name,child_node);
			if (tmp) ret=tmp;
		}
	});
	return ret;
}
function is_anchor_path(path) {
	var ind_colon=path.indexOf(':');
	var ind_slash=path.indexOf('/');
	if ((ind_slash<0)&&(ind_colon>=0)) {
		return (ind_colon==path.length-1);
	}
	if ((ind_slash>=0)&&(ind_colon>=0)) {
		return (ind_colon+1==ind_slash);
	}
	return false;
}
function find_node_from_path(path,ref_node) {
	if (!path) return ref_node;
	
	var ind_colon=path.indexOf(':');
	var ind_slash=path.indexOf('/');
	if (!is_anchor_path(path)) {
		//relative path
		var path1='',path2='';
		if (ind_slash>=0) {
			path1=path.slice(0,ind_slash);
			path2=path.slice(ind_slash+1);
		}
		else {
			path1=path;
			path2='';
		}
		var child_nodes_by_title={};
		(ref_node.children||[]).forEach(function(child_node) {
			child_nodes_by_title[child_node.title||'']=child_node;
		});
		if (path1 in child_nodes_by_title) {
			var tmp_node=child_nodes_by_title[path1];
			if (!path2) {
				return tmp_node;
			}
			else {
				return find_node_from_path(path2,tmp_node);
			}
		}
		else return null;
	}
	else {
		//anchor path
		var anchor_name=path.slice(0,ind_colon);
		var path2=path.slice(ind_colon+2);
		var anchor_node=find_node_from_anchor(anchor_name,ref_node);
		if (anchor_node) {
			return find_node_from_path(path2,anchor_node);
		}
		else return null;
	}
}


function set_map(params,callback) {
	var DB=DATABASE('maps');
	DB.setCollection('maps');
	DB.insert({
		name:params.name,
		data:params.data,
		access:(params.data||{}).access||{},
		owner:params.owner,
		timestamp:(new Date()).getTime(),
		timestamp_h:(new Date()).toString()
	},function(err) {
		if (err) {
			callback({success:false,error:'Error setting map: '+err});
			return;
		}
		callback({success:true});
	});
}
function delete_map(params,callback) {
	var DB=DATABASE('maps');
	DB.setCollection('maps');
	DB.insert({
		name:params.name,
		owner:params.owner,
		deleted:true,
		timestamp:(new Date()).getTime(),
		timestamp_h:(new Date()).toString()
	},function(err) {
		if (err) {
			callback({success:false,error:'Error deleting map: '+err});
			return;
		}
		callback({success:true});
	});
}

function find_most_recent_map(params,callback) {
	var DB=DATABASE('maps');
	DB.setCollection('maps');
	DB.find(params,{timestamp:1},function(err,docs) {
		if (err) {
			callback({success:false,error:'Error in find: '+err});
			return;
		}
		if ((docs.length===0)) {
			callback({success:false,error:'Unable to find map.'});
			return;
		}
		docs.sort(function(a,b) {
			if (a.timestamp<b.timestamp) return 1;
			else if (a.timestamp>b.timestamp) return -1;
			else return 0;
		});
		DB.find({_id:docs[0]._id},{},function(err,docs) {
			if (err) {
				callback({success:false,error:'Error in find: '+err});
				return;
			}
			if ((docs.length===0)) {
				callback({success:false,error:'Unable to find map.'});
				return;
			}
			if (docs[0].deleted) {
				callback({success:false,error:'This map has been deleted.'});
				return;
			}
			var tmp1=docs[0];
			tmp1.success=true;
			callback(tmp1);
		});
	});
}

function get_all_maps(params,callback) {
	var DB=DATABASE('maps');
	DB.setCollection('maps');
	DB.find({},{name:1,timestamp:1,owner:1,access:1,deleted:1},function(err,docs) {
		if (err) {
			callback({success:false,error:'Error in find *: '+err});
			return;
		}
		docs.sort(function(a,b) {
			if (a.timestamp<b.timestamp) return -1;
			else if (a.timestamp>b.timestamp) return 1;
			else return 0;
		});
		var maps={};
		docs.forEach(function(doc) {
			var code=doc.owner+'::'+doc.name;
			if (can_read_map(doc.owner,doc.access||{},params.user_id)) {
				maps[code]={name:doc.name,timestamp:doc.timestamp,owner:doc.owner};
			}
			if ((doc.deleted)&&(code in maps)) {
				delete maps[code];
			}
		});
		callback({success:true,maps:maps});
	});
}

function set_status(txt) {
	console.log (txt);
}

function merge_with_remote(params,callback) {
	set_status('merge_with_remote');
	if (!params.remote_port) {
		callback({success:false,error:'remote_port is empty'});
		return;
	}
	var DB_local=DATABASE('maps');
	var DB_remote=DATABASE('maps',params.remote_port);
	var ret={};
	set_status('merging local to remote');
	do_merge_map_databases(DB_local,DB_remote,function(tmp) {
		if (!tmp.success) {
			callback(tmp);
			return;
		}
		ret.num_added_to_remote=tmp.num_added;
		ret.num_contents_added_to_remote=tmp.num_contents_added;
		set_status('merging remote to local');
		do_merge_map_databases(DB_remote,DB_local,function(tmp) {
			if (!tmp.success) {
				callback(tmp);
				return;
			}
			ret.num_added_to_local=tmp.num_added;
			ret.num_contents_added_to_local=tmp.num_contents_added;
			ret.success=true;
			set_status('done_with_merge');
			callback(ret);
		});
	});
}

function do_merge_map_databases(DB_src,DB_dst,callback) {
	set_status('finding src docs');
	DB_src.setCollection('maps');
	DB_src.find({},{_id:1,name:1,owner:1,timestamp:1},function(err,docs_src) {
		if (err) {
			callback({success:false,error:'Error in find src: '+err});
			return;
		}
		set_status('finding dst docs');
		DB_dst.setCollection('maps');
		DB_dst.find({},{_id:1,name:1,owner:1,timestamp:1},function(err,docs_dst) {
			if (err) {
				callback({success:false,error:'Error in find dst: '+JSON.stringify(err)});
				return;
			}
			
			var all_docs=[];
			docs_src.forEach(function(doc) {all_docs.push(doc);});
			docs_dst.forEach(function(doc) {all_docs.push(doc);});
			all_docs.sort(function(a,b) {
				if (a.timestamp<b.timestamp) return -1;
				else if (a.timestamp>b.timestamp) return 1;
				else return 0;
			});
			var all_docs_by_code={};
			all_docs.forEach(function(doc) { //nonredundant
				var code=doc.name+':::'+doc.owner;
				all_docs_by_code[code]=doc;
			});
			var all_docs_nonredundant=[];
			for (var code in all_docs_by_code) {
				all_docs_nonredundant.push(all_docs_by_code[code]);
			}
			docs_dst_by_id={};
			docs_dst.forEach(function(doc) {
				docs_dst_by_id[doc._id.toHexString()]=doc;
			});
			var ids_missing_in_dst=[];
			all_docs_nonredundant.forEach(function(doc) {
				if (!(doc._id.toHexString() in docs_dst_by_id)) {
					ids_missing_in_dst.push(doc._id.toHexString());
				}
			});
			set_status('inserting docs');
			var full_records_to_insert_in_dst=[];
			common.for_each_async(ids_missing_in_dst,function(src_id,cb) {
				DB_src.setCollection('maps');
				DB_src.find({_id:new ObjectID(src_id)},{},function(err,docs0) {
					if (err) {
						cb({success:false,error:'Problem finding record: '+err});
						return;
					}
					if (docs0.length===0) {
						cb({success:false,error:'Unexpected problem in do_merge_map_databases, doc not found: '+src_id});
						return;
					}
					set_status('adding: '+docs0[0].name);
					full_records_to_insert_in_dst.push(docs0[0]);
					cb({success:true});
				});
			},function(tmp00) {
				if (!tmp00.success) {
					callback(tmp00);
					return;
				}
				common.for_each_async(full_records_to_insert_in_dst,function(doc00,cb) {
					set_status('inserting: '+doc00.name);
					DB_dst.setCollection('maps');
					DB_dst.insert(doc00,function(err) {
						if (err) {
							console.error('Problem inserting record: '+err);
							cb({success:false,error:'Problem inserting record: '+err});
							return;
						}
						cb({success:true});
					});
				},function(tmp11) {
					if (!tmp11.success) {
						callback(tmp11);
						return;
					}
					do_merge_contents(DB_src,DB_dst,function(tmp222) {
						if (!tmp222.success) {
							callback(tmp222);
							return;
						}
						callback({success:true,num_added:full_records_to_insert_in_dst.length,num_contents_added:tmp222.num_contents_added});
					});
				},1);	
			},5);
		});
	});
}

function do_merge_contents(DB_src,DB_dst,callback) {
	set_status('finding src docs');
	DB_src.setCollection('contents_by_checksum');
	DB_src.find({},{checksum:1},function(err,docs_src) {
		if (err) {
			callback({success:false,error:'Error in find src: '+err});
			return;
		}
		set_status('finding dst docs');
		DB_dst.setCollection('contents_by_checksum');
		DB_dst.find({},{checksum:1},function(err,docs_dst) {
			if (err) {
				callback({success:false,error:'Error in find dst: '+JSON.stringify(err)});
				return;
			}
			
			var src_checksums={};
			var dst_checksums={};
			docs_src.forEach(function(doc) {
				src_checksums[doc.checksum]=1;
			});
			docs_dst.forEach(function(doc) {
				dst_checksums[doc.checksum]=1;
			});
			
			var checksums_to_send=[];
			for (var checksum in src_checksums) {
				if (!(checksum in dst_checksums)) {
					checksums_to_send.push(checksum);
				}
			}
			console.log ('finding docs in src: '+checksums_to_send.length);
			DB_src.setCollection('contents_by_checksum');
			DB_src.find({checksum:{$in:checksums_to_send}},{},function(err,docs_to_send) {
				if (err) {
					callback({success:false,error:'Error in find docs to send: '+JSON.stringify(err)});
					return;
				}
				console.log ('inserting docs: '+docs_to_send.length);
				DB_dst.insert(docs_to_send,function(err) {
					if (err) {
						callback({success:false,error:'Error in setting content in destination database: '+JSON.stringify(err)});
						return;
					}
					callback({success:true,num_contents_added:docs_to_send.length});
				});
			});
		});
	});
}



/*
function open_database(params,callback) {
	var db=new mongo.Db('maps', new mongo.Server('localhost',params.port||27017, {}), {safe:true});
	db.open(function(err,db) {
		if (err) {
			if (callback) callback(err,null);
		}
		else {
			if (callback) callback('',db);
		}
	});
}
*/

exports.maps=maps;
