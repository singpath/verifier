# GCE Deployment

0. Edit `vm.yaml` properties, especially `singpathSecret` and `singpathEndpoint`.

1. Create a [Google Cloud project](https://console.developers.google.com/billing/freetrial)
2. [Enable Compute Engine](https://console.developers.google.com/start/api?id=compute_component)
3. [Enable Deployment Manager V2](https://console.developers.google.com/start/api?id=deploymentmanager)
4. Install gcloud SDK:
        ```shell
        curl https://sdk.cloud.google.com | bash
        gcloud auth login
        gcloud config set project myproject
        ```
5. Deploy the verifier:
        ```shell
        gcloud deployment-manager deployments create singpath-verifier --config vm.yaml
        ```


To delete the server:
```shell
gcloud deployment-manager deployments delete singpath-verifier
```
