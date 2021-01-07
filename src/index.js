const core = require('@actions/core');
const { spawnSync } = require('child_process');

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
  }
  

function execute_command(command, args) {
    core.info(`Run ${command} ${args}`);
    var result = spawnSync(command, args);
    if(result.status == 0) {
        core.info(`${String(result.stdout)}`);
        return 0;
    } else {
        core.error(`${String(result.stderr)}`);
        return 1;
    }
}

function wait_for_minikube() {
    var i = 0;
    var command = 'kubectl';
    var args = ['create', 'clusterrolebinding', 'add-on-cluster-admin', '--clusterrole=cluster-admin', '--serviceaccount=kube-system:default'];

    while(i < 60) {
        if (execute_command(command, args) == 0) {
            return 0;
        } else {
            sleep(1000).then(() => {
                core.info("Minikube is not ready yet.");
            });
        }
    }
    core.setFailed("Minikube failed to start or RBAC could not be properly set up");
}

function install_deps() {
    var startCommand = 'sudo';
    var startArgs = ['-E', 'apt-get', 'install', 'conntrack'];
    return execute_command(startCommand, startArgs);
}

function install_minikube() {
    const minikubeVersion = core.getInput('minikube-version');
    core.info(`Downloading Minikube...`);
    var kubeDownCommand = 'curl';
    var kubeDownArgs = ['-LO', `https://storage.googleapis.com/minikube/releases/latest/minikube_${minikubeVersion}-0_amd64.deb`];
    if (execute_command(kubeDownCommand, kubeDownArgs) == 1) return 1;

    core.info(`Installing Minikube...`);
    var kubeInstallCommand = 'sudo';
    var kubeInstallArgs = ['dpkg', '-i', `minikube_${minikubeVersion}-0_amd64.deb`];
    return execute_command(kubeInstallCommand, kubeInstallArgs);
}

function run_registry() {
    core.info(`Running registry...`);
    var registryCommand = 'docker';
    var registryArgs = ['run', '--name', 'image-registry', '-d', '-p', '5000:5000', '--restart=always', 'registry'];
    return execute_command(registryCommand, registryArgs);
}

function start_minikube() {
    const kubernetesVersion = core.getInput('k8s-version');
    core.exportVariable('CHANGE_MINIKUBE_NONE_USER', true);
    var startCommand = 'minikube';
    var startArgs = ['start', '--vm-driver=docker', '--kubernetes-version',
    `v${kubernetesVersion}`, '--extra-config=kubeadm.ignore-preflight-errors=SystemVerification', '--extra-config=apiserver.authorization-mode=RBAC,Node']

    if(execute_command(startCommand, startArgs) == 1) return 1;
    
    var addons = ['default-storageclass', 'ingress'];
    for (var i in addons) {
        var addon = addons[i];
        var addonsCommand = 'sudo';
        var addonsArgs = ['-E', 'minikube', 'addons', 'enable', addon];
        if (execute_command(addonsCommand, addonsArgs) == 1) return 1;
    }


    // Enable SSL passthrough support
    var ingressCommand = 'kubectl';
    var ingressArgs = ['patch', 'deployment', 'ingress-nginx-controller', '-n', 'kube-system', '--type=json', '-p', '[{"op" : "add", "path" : "/spec/template/spec/containers/0/args/-", "value" : "--enable-ssl-passthrough"}]']
    return execute_command(ingressCommand, ingressArgs);
}

try {
    if (install_deps() || install_minikube() || run_registry() || start_minikube() || wait_for_minikube()) {
        core.setFailed(error.message);    
    }
    
} catch (error) {
    core.setFailed(error.message);
}
