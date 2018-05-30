const fs = require('fs');
const Rx = require('rxjs/Rx');
const request = require('request');

const DEPLOYMENT_NAME = 'webswing';
const GET_PODS_ENDPOINT = '/api/v1/namespaces/default/pods';
const DELETE_POD_ENDPOINT = '/api/v1/pods'
const GET_DEPLOYMENTS_ENDPOINT = '/apis/extensions/v1beta1/namespaces/default/deployments';

// the master uses self-signed SSL certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

Rx.Observable.defer(() => new Promise((resolve, reject) => {
    resolve({
	    masterUrl: 'http://localhost:8080',
      serviceToken: 'serviceToken'
    });
}))
.combineLatest(
  Rx.Observable.interval(10 * 1000),
  (credentials, i) => credentials
)
.do(credentials => {
		pods = getPodsOfDeployment(credentials, DEPLOYMENT_NAME);
		load = getMetrics(pods[0]);
		console.log('current load: ' + JSON.stringify(load));
		return {
			pods: pods,
			load: load
		}
	})
  .switchMap(loadTuple => {
	if(loadTuple.load > 3) { /* Avg number of instances per pod */	  
	  sacrifice = getDownscaleNode(loadTuple.pods[0]);
	  if(sacrifice.state == "DRAIN"){
		console.log('Node ${sacrifice.nodeId} is in DRAIN mode with ${sacrifice.runningCount} running instances');
		if(sacrifice.runningCount == 0){
			deletePOD(sacrifice.name, credentials.masterUrl, DEPLOYMENT_NAME, loadTuple.pods.length + 1, credentials.serviceToken)
			return updateReplicas(credentials.masterUrl, DEPLOYMENT_NAME, loadTuple.pods.length + 1, credentials.serviceToken)
				.do(() => console.log(`scaled up to ${loadTuple.pods.length + 1} replicas`))
				.delay(20 * 1000) /* delay next scaling operation */
		}
	  }
	}

	if(loadTuple.load < 2) {
	  return updateReplicas(credentials.masterUrl, DEPLOYMENT_NAME, loadTuple.pods.length - 1, credentials.serviceToken)
		.do(() => console.log(`scaled down to ${loadTuple.pods.length - 1} replicas`))
		.delay(20 * 1000) /* delay next scaling operation */
	}

	return Rx.Observable.empty();//noop
  })

.subscribe(
  val => {},
  err => console.log('ERR: ' + err.message + '\r\n' + err.stack)
);


function getMetrics(pod) {
  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.get(`http://${pod.status.podIP}:8080/rest/instanceRate`, (error, response, body) =>{
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to get data from api: ${body}`)) }
        return resolve({pod: pod, load: body});
      });
    });
  });
}

function getDownscaleNode(pod) {
  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.get(`http://${pod.status.podIP}:8080/rest/getDonwscaleNode`, (error, response, body) =>{
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to get data from api: ${body}`)) }
        return resolve({pod: pod, load: body});
      });
    });
  });
}

function getPodsOfDeployment(credentials, deployment) {
  return getFromKubernetesApi(credentials.masterUrl, GET_PODS_ENDPOINT, credentials.serviceToken)
    .flatMap(res => res.items)
    .filter(pod => pod.metadata.name.startsWith(deployment)) /* convention based */
    .filter(pod => pod.status.phase == 'Running') /* only running pods count for our hpa metrics*/;
};

function getFromKubernetesApi(kubernetesMasterURL, apiEndPoint, token) {
  const options = _createHttpRequestOptions(kubernetesMasterURL, apiEndPoint, token);

  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.get(options, (error, response, body) =>{
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to get data from api: ${body}`)) }
        return resolve(body);
      });
    });
  });
}

function deletePOD(pod, kubernetesMasterURL, deployment, desiredReplicas, token) {
  const pods = getFromKubernetesApi(credentials.masterUrl, GET_PODS_ENDPOINT + '?fieldSelector\=status.podIP\=${pod}', credentials.serviceToken);
  console.log('Delete POD: ' + pods[0]);
  
  const options = _createHttpRequestOptions(kubernetesMasterURL, '${DELETE_POD_ENDPOINT}/${pods[0].name}', token);

  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.delete(options, (error, response, body) =>{
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to delete pod: ${body}`)) }
        return resolve(body);
      });
    });
  });
}

function updateReplicas(kubernetesMasterURL, deployment, desiredReplicas, token) {
  const options = _createHttpRequestOptions(kubernetesMasterURL, `${GET_DEPLOYMENTS_ENDPOINT}/${deployment}`, token);
  options.headers = {
      'Content-Type': 'application/json-patch+json'
    };
  options.body = [
    {
      op: 'replace',
      path: '/spec/replicas',
      value: desiredReplicas
    }
  ];

  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.patch(options, (error, response, body) => {
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to patch deploy from api: ${body}`)) }
        return resolve(body);
      });
    });
  });
}

function _createHttpRequestOptions(masterUrl, apiEndPoint, token) {
  return {
    url: masterUrl + apiEndPoint,
    auth: {
      bearer: token
    },
    json: true,
    timeout: 2 * 1000
  };
}
