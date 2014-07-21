//rename this file to wisdmconfig.js and modify

var wisdmconfig={};

wisdmconfig.processing_node={
	node_id:'node1',
	node_path:'/home/magland/processing_nodes/node1',
	server_host:'localhost',
	server_port:8081
};

wisdmconfig.wisdm_server={
	listen_port:8000,
	www_path:'/home/magland/public_html/magland.org/public',
	server_source_path:'/home/magland/dev/nodejs',
	users_path:'/home/magland/.wisdm/users.json',
	auth_path:'/tmp/wisdmauth',
	processingwebserver_url:'http://localhost:8001',
	github_client_id:'',
	github_client_secret:'',
	google_client_id:'',
	google_client_secret:''
};

wisdmconfig.processing_server={
	listen_port:8081
};

wisdmconfig.wisdmprocessing={
	source_path:'/home/magland/dev/nodejs/wisdmprocessing'
};

exports.wisdmconfig=wisdmconfig;