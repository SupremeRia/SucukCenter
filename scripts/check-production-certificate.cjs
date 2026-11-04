const { spawnSync } = require('node:child_process');
const id = process.env.SC_PRODUCTION_CERT_THUMBPRINT;
if (!/^[a-fA-F0-9]{40}$/.test(id || ''))
  throw new Error('SC_PRODUCTION_CERT_THUMBPRINT gerekli. Anahtar veya parola kaynağa yazılmaz.');
const script =
  "$ErrorActionPreference='Stop'; $store=New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser'); $store.Open('ReadOnly'); try { $matches=@($store.Certificates | Where-Object {$_.Thumbprint -eq '" +
  id +
  "'}); if($matches.Count -ne 1){throw 'Üretim sertifikası kullanıcı deposunda bulunamadı.'}; $c=$matches[0]; $eku=@($c.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.37'} | ForEach-Object {$_.EnhancedKeyUsages} | ForEach-Object {$_.Value}); if('1.3.6.1.5.5.7.3.3' -notin $eku -or $c.Subject -eq $c.Issuer -or -not $c.HasPrivateKey -or $c.NotBefore -gt (Get-Date) -or $c.NotAfter -lt (Get-Date) -or -not $c.Verify()){throw 'Güvenilir üretim sertifikası doğrulanamadı.'}; Write-Output 'PASS üretim sertifikası zinciri' } finally { $store.Close() }";
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
