const base = require('./package.json').build;
const thumbprint = process.env.SC_PRODUCTION_CERT_THUMBPRINT;
if (!/^[a-fA-F0-9]{40}$/.test(thumbprint || ''))
  throw new Error('Güvenilir üretim sertifikası parmak izi gerekli.');
module.exports = {
  ...base,
  forceCodeSigning: true,
  directories: { output: 'release/windows' },
  win: {
    ...base.win,
    signExecutable: true,
    artifactName: 'SucukCenter-${version}-Kurulum.${ext}',
    signtoolOptions: {
      certificateSha1: thumbprint,
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
    },
  },
};
