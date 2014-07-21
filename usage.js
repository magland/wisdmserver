//var WISDMUSAGE=require('../processingnodeclient/src/wisdmusage').WISDMUSAGE;

function usage(request,callback) {
	var permissions=(request.auth_info||{}).permissions||{};
	var user_id=(request.auth_info||{}).user_id;
	if (user_id!='magland') {
		callback({success:false,error:'You are not authorized to retrieve usage information'});
		return;
	}
	var command=request.command||'';
	var date=request.date||'';
	var request_user_id=request.user_id||'';
	if (command=='getAllUsers') {
		//WISDMUSAGE.getAllUsers({date:date},callback);
	}
	else if (command=='getUsage') {
		//WISDMUSAGE.getUsage({date:date,user_id:request_user_id},callback);
	}
	else {
		callback({success:false,error:'Unknown command: '+command});
	}
}


exports.usage=usage;
