//rename this file to wisdmconfig.js and modify

var wisdmconfig={};

wisdmconfig.wisdm_server={
        listen_port:8080,
        www_path:'/home/magland/wisdm/www',
        server_source_path:'/home/magland/wisdm',
        processingwebserver_url:'http://wisdmhub.org:8081',
        users_path:'/home/magland/.wisdm/users.json',
        auth_path:'/tmp/wisdmauth',
        github_client_id:'',
        github_client_secret:'',
        google_client_id:'',
        google_client_secret:''
};

exports.wisdmconfig=wisdmconfig;
