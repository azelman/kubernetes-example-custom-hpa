const fs = require('fs');
const Rx = require('rxjs/Rx');
const request = require('request');

const DEPLOYMENT_NAME = 'my-app';
const GET_PODS_ENDPOINT = '/api/v1/namespaces/default/pods';
const GET_DEPLOYMENTS_ENDPOINT = '/apis/extensions/v1beta1/namespaces/default/deployments';

// the master uses self-signed SSL certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

Rx.Observable.defer(() => new Promise((resolve, reject) => {
  fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', (err, serviceToken) => {
    if (err) {
      return reject(err);
    }
    resolve({
      masterUrl: 'https://kubernetes',
      serviceToken: serviceToken
    });
  });
}))
.combineLatest(
  Rx.Observable.interval(10 * 1000),
  (credentials, i) => credentials
)
.switchMap(credentials => getPodsOfDeployment(credentials, DEPLOYMENT_NAME)
  .mergeMap(pod => getMetrics(pod))
  .toArray()
  .map(metricArray => {
    //calculate average req/sec of all pods
    const sum = metricArray.reduce((acc, curr) => acc + curr, 0);
    return {
      pods: metricArray.length,
      avgReqSec: sum / metricArray.length
    };
  })
  .do(loadTuple => console.log('current load: ' + JSON.stringify(loadTuple)))
  .switchMap(loadTuple => {
    if(loadTuple.avgReqSec > 10) {
      return updateReplicas(credentials.masterUrl, DEPLOYMENT_NAME, loadTuple.pods + 1, credentials.serviceToken)
        .do(() => console.log(`scaled up to ${loadTuple.pods + 1} replicas`))
        .delay(10 * 1000) /* delay next scaling operation */
    }

    if(loadTuple.avgReqSec < 5 && loadTuple.pods > 1) {
      return updateReplicas(credentials.masterUrl, DEPLOYMENT_NAME, loadTuple.pods - 1, credentials.serviceToken)
        .do(() => console.log(`scaled down to ${loadTuple.pods - 1} replicas`))
        .delay(10 * 1000) /* delay next scaling operation */
    }

    return Rx.Observable.empty();//noop
  })
)
.subscribe(
  val => {},
  err => console.log('ERR: ' + err.message + '\r\n' + err.stack)
);


function getMetrics(pod) {
  return Rx.Observable.defer(() => {
    return new Promise((resolve, reject) => {
      request.get(`http://${pod.status.podIP}:8080/rate`, (error, response, body) =>{
        if(error) { return reject(error); }
        if(response && response.statusCode >= 300){ return reject(new Error(`Unable to get data from api: ${body}`)) }
        return resolve(body);
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