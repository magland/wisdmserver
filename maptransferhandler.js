if (typeof(utils)!='object') utils=require('./common').common;
if (typeof(exports)!='undefined') exports.MapTransferHandler=MapTransferHandler;

function MapTransferHandler() {
	this.addContentsToMap=function(map,contents_by_checksum) {return _addContentsToMap(map,contents_by_checksum);};
	this.getChecksumsFromMap=function(map,checksums) {_getChecksumsFromMap(map,checksums);};
	this.getContentsByChecksumFromDatabase=function(DB,checksums,callback) {_getContentsByChecksumFromDatabase(DB,checksums,callback);};
	this.getChecksumsInDatabase=function(DB,checksums,callback) {_getChecksumsInDatabase(DB,checksums,callback);};
	this.setContentsByChecksumToDatabase=function(DB,contents_by_checksum,callback) {_setContentsByChecksumToDatabase(DB,contents_by_checksum,callback);};
	this.replaceLargeContentsWithChecksums=function(map,contents_by_checksum) {_replaceLargeContentsWithChecksums(map,contents_by_checksum);};
	
	function _addContentsToMap(map,contents_by_checksum) {
		var ret=true;
		if ('content' in map) {
			if ((is_object(map.content))&&('checksum' in map.content)&&(map.content.checksum)) {
				if (map.content.checksum in contents_by_checksum) {
					var content0=contents_by_checksum[map.content.checksum];
					map.content=content0;
					map.checksum=map.content.checksum;
				}
				else {
					ret=false;
				}
			}
		}
		for (var key in map) {
			if (is_object(map[key])) {
				if (!_addContentsToMap(map[key],contents_by_checksum)) {
					ret=false;
				}
			}
		}
		return ret;
	}
	function _getChecksumsFromMap(map,checksums) {
		if ('content' in map) {
			if ((is_object(map.content))&&('checksum' in map.content)&&(map.content.checksum)) {
				checksums.push(map.content.checksum);
			}
		}
		for (var key in map) {
			if (is_object(map[key])) {
				_getChecksumsFromMap(map[key],checksums);
			}
		}
		return true;
	}
	function _getContentsByChecksumFromDatabase(DB,checksums,callback) {
		var ret={};
		DB.setCollection('contents_by_checksum');
		utils.for_each_async(checksums,function(checksum,cb) {
			DB.find({checksum:checksum},{content:1},function(err,docs) {
				if (err) {
					cb({success:false,error:'Problem in find (49): '+err});
					return;
				}
				if (docs.length>0) {
					ret[checksum]=docs[0].content;
				}
				DB.update({checksum:checksum},{$set:{last_accessed:(new Date()).getTime()}},function(err) {
					if (err) {
						cb({success:false,error:'Problem updating last_accessed: '+err});
						return;
					}
					cb({success:true});
				});
			});
		},function(tmpDD) {
			if (!tmpDD.success) {
				callback(tmpDD);
				return;
			}
			callback({success:true,contents_by_checksum:ret});
		},5);
	}
	function _getChecksumsInDatabase(DB,checksums,callback) {
		var ret={};
		DB.setCollection('contents_by_checksum');
		DB.find({checksum:{$in:checksums}},{checksum:1},function(err,docs) {
			if (err) {
				callback({success:false,error:'Problem in find (81): '+err});
				return;
			}
			var ret_checksums={};
			docs.forEach(function(doc) {
				ret_checksums[doc.checksum]=1;
			});
			callback({success:true,checksums:ret_checksums});
		});
	}
	function _setContentsByChecksumToDatabase(DB,contents_by_checksum,callback) {
		DB.setCollection('contents_by_checksum');
		var checksums=[];
		for (var checksum in contents_by_checksum) checksums.push(checksum);
		utils.for_each_async(checksums,function(checksum,cb) {
			DB.find({checksum:checksum},{},function(err,docs) {
				if (err) {cb({success:false,error:err}); return;}
				if (docs.length===0) {
					var content0=contents_by_checksum[checksum];
					DB.insert({checksum:checksum,content:content0,last_accessed:(new Date()).getTime()},function(err) {
						if (err) {
							cb({success:false,error:err});
							return;
						}
						cb({success:true});
					});
				}
				else cb({success:true});
			});
		},function(tmpEE) {
			if (!tmpEE.success) {
				callback(tmpEE);
				return;
			}
			callback({success:true});
		},5);
	}
	function compute_checksum(str) {
		if (typeof(sha1)!='undefined') {
			return sha1(str).toString();
		}
		else {
			var crypto=require('crypto');
			var ret=crypto.createHash('sha1');
			ret.update(str);
			return ret.digest('hex');
		}
	}
	function _replaceLargeContentsWithChecksums(map,contents_by_checksum) {
		do_replace_large_contents(map,contents_by_checksum);
		return;
		
		function do_replace_large_contents(map,contents_by_checksum) {
			if ('content' in map) {
				if (map.content.length>100) {
					var checksum='';
					if (('checksum' in map)&&(map.checksum)) {
						checksum=map.checksum;
					}
					else {
						checksum=compute_checksum(map.content);
					}
					contents_by_checksum[checksum]=map.content;
					map.content={checksum:checksum};
				}
			}
			for (var key in map) {
				if (is_object(map[key])) {
					do_replace_large_contents(map[key],contents_by_checksum);
				}
			}
		}
	}
	
	function is_object(X) {
		if (!X) return false;
		return (typeof(X)=='object');
	}
	
}
