// The signing identity must match the certificate. Private keys/passwords stay outside source control.
const base = require('./package.json').build;
const thumbprint = process.env.RIACODING_CERT_THUMBPRINT;
if (thumbprint && !/^[a-fA-F0-9]{40}$/.test(thumbprint))
  throw new Error('RIACODING_CERT_THUMBPRINT geçerli bir sertifika parmak izi olmalı.');
module.exports = {
  ...base,
  forceCodeSigning: true,
  directories: { output: 'review-builds/signed' },
  extraMetadata: { author: 'RiaCoding' },
  win: {
    ...base.win,
    signExecutable: true,
    artifactName: 'SucukCenter-${version}-RiaCoding-Kurulum.${ext}',
    signtoolOptions: {
      publisherName: 'RiaCoding',
      signingHashAlgorithms: ['sha256'],
      rfc3161TimeStampServer: 'http://timestamp.digicert.com',
      ...(thumbprint ? { certificateSha1: thumbprint } : {}),
    },
  },
};
