# kubernetes-example-custom-hpa


## example app

simple webserver which does request/sec counting and exposes this metric

### development
`npm install`
`npm start`

- `curl localhost:8080/` to have requests counting
- `curl localhost:8080/rate` to retrieve the current rate of requests to the pod

## custom-hpa

retrieves the pods labelled `` from the kubernetes master and for each pod invokes `/rate` endpoint to retrieve its current rate of requests.

`npm install`
`npm start`


## Get the sample running (using minikube)

### minikube setup
- get minikube up and running locally using [this guide](https://kubernetes.io/docs/getting-started-guides/minikube/#reusing-the-docker-daemon)
- link your docker commandline to the docker daemon inside minikube by invoking `eval $(minikube docker-env)`

### demo app
- Build the app container `docker build -t example-custom-hpa/app:1.0.0 -f app/Dockerfile ./app`
- Deploy the app to kubernetes `kubectl create -f app/deployment.yaml`
- Deploy the service to kubernetes `kubectl create -f app/service.yaml` so you can route traffic to the pods
- Observe that it works by invoking `minikube service my-app` which connects you to the service
- Observe that it works by looking at the logs `kubectl get pods | grep my-app | awk '{print $1}' | xargs kubectl logs -f `

### custom hpa
- Build the hpa container `docker build -t example-custom-hpa/hpa:1.0.0 -f hpa/Dockerfile ./hpa`
- Deploy the hpa to kubernetes `kubectl create -f app/deployment.yaml`
- Observe that it works by looking at the logs `kubectl get pods | grep my-custom-hpa | awk '{print $1}' | xargs kubectl logs -f `


### iterating development

- APP: `docker build -t example-custom-hpa/app:1.0.0 -f app/Dockerfile ./app && kubectl get pods | grep my-app | awk '{print $1}' | xargs kubectl delete pod`
- HPA: `docker build -t example-custom-hpa/hpa:1.0.0 -f hpa/Dockerfile ./hpa && kubectl get pods | grep hpa | awk '{print $1}' | xargs kubectl delete pod`


### scale traffic using ab

Lets it it with some traffic. The IP address + port is retrieved using `minikube service my-app`
- `ab -n 1000 -c 3 http://192.168.99.100:31284/`
- Observe the logs of the HPA using `kubectl get pods | grep my-custom-hpa | awk 'END {print $1}' | xargs kubectl logs -f `