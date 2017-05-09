# Demo/Example custom horizontal pod autoscaler

This repository contains a demo app + custom hpa to show how to utilize the Kubernetes API for retrieval and modification of the state of kubernetes as a whole.

## demo app

The demo app is a simple webserver which does request/sec counting and exposes this metric at the `/rate` endpoint.

### development

- `npm install`
- `npm start`

The following urls are available:
- `curl localhost:8080/` to have requests counting
- `curl localhost:8080/rate` to retrieve the current rate of requests to the pod

## custom hpa

The custom HPA retrieves the list of pods from the kubernetes master and for each pod fetches the `/rate` endpoint to retrieve its current rate of requests.

## development

- `npm install`
- `npm start`

# Fast iterating kubernetes deploy + development

You can use the following concatinated expression to build the container, delete current pods and have it be used. Because we are re-using the same version after deleting the pod in the cluster it uses the new image. 

- APP: `docker build -t example-custom-hpa/app:1.0.0 -f app/Dockerfile ./app && kubectl get pods | grep my-app | awk '{print $1}' | xargs kubectl delete pod`
- HPA: `docker build -t example-custom-hpa/hpa:1.0.0 -f hpa/Dockerfile ./hpa && kubectl get pods | grep hpa | awk '{print $1}' | xargs kubectl delete pod`

# Get the demo running (using minikube)

## minikube setup
- get minikube up and running locally using [this guide](https://kubernetes.io/docs/getting-started-guides/minikube/#reusing-the-docker-daemon)
- link your docker commandline to the docker daemon inside minikube by invoking `eval $(minikube docker-env)`. That way the images you build using docker are immediately available on the minikube node as if they are cached from the repository and no further setup is required.

## demo app
- Build the app container `docker build -t example-custom-hpa/app:1.0.0 -f app/Dockerfile ./app`
- Deploy the app to kubernetes `kubectl create -f app/deployment.yaml`
- Deploy the service to kubernetes `kubectl create -f app/service.yaml` so you can route traffic to the pods
- Observe that it works by invoking `minikube service my-app` which connects you to the service
- Observe that it works by looking at the logs `kubectl get pods | grep my-app | awk '{print $1}' | xargs kubectl logs -f `

## custom hpa
- Build the hpa container `docker build -t example-custom-hpa/hpa:1.0.0 -f hpa/Dockerfile ./hpa`
- Deploy the hpa to kubernetes `kubectl create -f app/deployment.yaml`
- Observe that it works by looking at the logs `kubectl get pods | grep my-custom-hpa | awk '{print $1}' | xargs kubectl logs -f `

## scale traffic using ab

Lets hit it with some traffic. The IP address + port of the demo app is retrieved using `minikube service my-app`
- `ab -n 1000 -c 3 http://192.168.99.100:31284/` update the ip address as returned from the above command
- Observe the logs of the HPA using `kubectl get pods | grep my-custom-hpa | awk 'END {print $1}' | xargs kubectl logs -f `
