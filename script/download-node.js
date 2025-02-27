const fs = require('fs');
const mv = require('mv');
const zlib = require('zlib');
const path = require('path');

const tar = require('tar');
const temp = require('temp');

const request = require('request');
const getInstallNodeVersion = require('./bundled-node-version')

temp.track();

const identifyArch = function() {
  switch (process.arch) {
    case "ia32":  return "x86";
    case "arm":   return `armv${process.config.variables.arm_version}l`;
    default:      return process.arch;
  }
};

const downloadFileToLocation = function(url, filename, callback) {
  const stream = fs.createWriteStream(filename);
  stream.on('end', callback);
  stream.on('error', callback);
  const requestStream = request.get(url)
  requestStream.on('response', function(response) {
    if (response.statusCode == 404) {
      console.error('download not found:', url);
      process.exit(1);
    }
    requestStream.pipe(stream);
  });
};

const downloadTarballAndExtract = function(url, location, callback) {
  const tempPath = temp.mkdirSync('apm-node-');
  const stream = tar.extract({
    cwd: tempPath
  });
  stream.on('end', function() {
    callback.call(this, tempPath);
  });
  stream.on('error', callback);
  const requestStream = request.get(url)
  requestStream.on('response', function(response) {
    if (response.statusCode == 404) {
      console.error('download not found:', url);
      process.exit(1);
    }
    requestStream.pipe(zlib.createGunzip()).pipe(stream);
  });
};

const copyNodeBinToLocation = function(callback, version, targetFilename, fromDirectory) {
  const arch = identifyArch();
  const subDir = `node-${version}-${process.platform}-${arch}`;
  const downloadedNodePath = path.join(fromDirectory, subDir, 'bin', 'node');
  return mv(downloadedNodePath, targetFilename, {mkdirp: true}, function(err) {
    if (err) {
      callback(err);
      return;
    }

    fs.chmodSync(targetFilename, "755");
    callback()
  });
};

const downloadNode = function(version, done) {
  const arch = identifyArch();
  const filename = path.join(__dirname, '..', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');

  const downloadFile = function() {
    if (process.platform === 'win32') {
      downloadFileToLocation(`https://nodejs.org/dist/${version}/win-${arch}/node.exe`, filename, done);
    } else {
      const next = copyNodeBinToLocation.bind(this, done, version, filename);
      downloadTarballAndExtract(`https://nodejs.org/dist/${version}/node-${version}-${process.platform}-${arch}.tar.gz`, filename, next);
    }
  }

  if (fs.existsSync(filename)) {
    getInstallNodeVersion(filename, function(error, installedVersion, installedArch) {
      if (error != null) {
        done(error);
      } else if (installedVersion !== version || installedArch !== process.arch) {
        downloadFile();
      } else {
        done();
      }
    });
  } else {
    downloadFile();
  }
};

const versionToInstall = fs.readFileSync(path.resolve(__dirname, '..', 'BUNDLED_NODE_VERSION'), 'utf8').trim()
downloadNode(versionToInstall, function(error) {
  if (error != null) {
    console.error('Failed to download node', error);
    return process.exit(1);
  } else {
    return process.exit(0);
  }
});
