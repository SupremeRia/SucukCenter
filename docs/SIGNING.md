> Tarihsel sürüm kaydıdır. Güncel arayüz, paket ve test sınırları için kökteki README.md ve TEST-RESULTS.md dosyalarını kullanın.

# RiaCoding kod imzası

Güncel 1.7.0 paketinin SHA256, boyut ve yerel test imzası sınırı: [EXPENSES-1.7.md](EXPENSES-1.7.md).

Güncel 1.6.1 paketinin SHA256, boyut ve test imzası sınırı: [AUDIT-1.6.1.md](AUDIT-1.6.1.md).

Güncel 1.6.0 kayıt yönetimi paketi, özeti ve test imzası sınırı: [RECORDS-1.6.md](RECORDS-1.6.md).

Önceki 1.5.1 seçim listeleri paketi: [CHOICES-1.5.1.md](CHOICES-1.5.1.md).

31.10.2026: Güncel 1.5.0 kurulum/uygulama/kaldırıcı test imzası, dosya özeti ve Windows güven sınırı: [PREORDERS-1.5.md](PREORDERS-1.5.md).

31.10.2026: 1.4.0 kurulum, uygulama ve kaldırıcı da aynı kullanıcı onaylı yerel test sertifikası ve zaman damgasıyla imzalandı. Güncel dosya özeti ve Windows güven sınırı: [ACCOUNTS-1.4.md](ACCOUNTS-1.4.md). Aşağıdaki 1.3 ölçümleri tarihsel kayıttır.

İmzalı paket için ayrı yapılandırma: `electron-builder.signed.cjs`. Yayıncı adı RiaCoding, algoritma SHA-256, RFC 3161 zaman damgası ve zorunlu imzalama etkin. Sertifika bulunamazsa işlem imzasız paketi başarılı gibi sunmaz. Normal inceleme paketi ve onun kayıtlı özeti korunur.

29.10.2026 ilk kontrolünde mevcut kod imzalama sertifikası bulunmadı. Kullanıcının açık seçimiyle **CN=RiaCoding yerel test sertifikası oluşturuldu ve ayrı 1.3.0 paketi imzalandı**. Önceki inceleme EXE'si imzasız olarak korundu.

## Tamamlanan test imzası

- Sertifika: RSA 3072 / SHA-256; geçerlilik sonu 29.10.2028. Özel anahtar yalnız CurrentUser/My deposunda, dışa aktarılamaz olarak oluşturuldu. Güvenilen kök/yayıncı depolarına eklenmedi.
- Kurulum, ana uygulama ve kurulumdan **çalıştırmadan çıkarılan** kaldırıcı üzerinde CN=RiaCoding ve DigiCert RFC 3161 zaman damgası görüldü.
- PowerShell sonucu `UnknownError`: mesaj, zincirin güvenilmeyen kökte sonlandığını belirtiyor. SignTool `/pa /v` de aynı güvenilmeyen kök nedeniyle 1 hata verdi; **Windows güven doğrulaması başarılı değildir**. Bu sonuç test sertifikasıyla beklenir; SmartScreen güveni sağlandığı anlamına gelmez.
- `npm run dist:signed`: başarılı (typecheck ve üretim derlemesi dahil). `npm run lint`: başarılı. İmzalı klasör üzerinde `test:package`: başarılı, içerik güncel derlemeyle eşleşti. Gerçek veritabanı açılmadı, kurulum çalıştırılmadı.
- İmzalı kurulum: `review-builds/signed/SucukCenter-1.3.0-RiaCoding-Kurulum.exe`, 134932344 bayt.
- SHA256: `9E3A1E5C5A2618FDBC3CF26B46A02B674CCAB236DB2804B4F5A245036B477C3D`.
- İmzasız kurulumun SHA256 değeri değişmedi: `BC40EEEC20E4A26D9EBC76499FF90B1DE5373296EDB6F4E066A20E85439FB9BA`.

Yerel ayrıntılı sonuçlar `artifacts/signing-check/results.json`, SignTool çıktısı aynı klasörde bulunur; bunlar Git dışında tutulur. Dışa aktarılan `.cer` yalnız açık sertifikadır, özel anahtar içermez. Özel anahtar dışa aktarılamadığı için bu sertifika başka bilgisayarda imzalama için kullanılamaz. Tekrar derleme için bu bilgisayardaki sertifikanın parmak izi yerel `RIACODING_CERT_THUMBPRINT` değişkeniyle seçilmelidir; sertifika yokken zorunlu imzalama hata vermelidir.

## Geçerli yayıncı sertifikası

Windows'un yayıncıya güvenebilmesi için geçerli bir Authenticode kod imzalama sertifikası ve ona ait özel anahtara erişim gerekir. Sertifikanın yayıncı adı RiaCoding ile eşleşmelidir; doğrulanmış bir sertifikanın kimliği yalnız metin değiştirerek seçilemez.

Sertifika Windows sertifika deposunda ise yalnız parmak izi `RIACODING_CERT_THUMBPRINT` yerel ortam değişkenine verilebilir. PFX kullanılıyorsa electron-builder'ın `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` yerel ortam değişkenleri kullanılabilir. Parolayı sohbete, komut geçmişine, kaynak koda veya README'ye yazmayın; varsa donanım anahtarı/sağlayıcı iş akışı kullanılmalıdır.

```powershell
npm run dist:signed
```

Çıktı: `review-builds/signed/SucukCenter-1.3.0-RiaCoding-Kurulum.exe`. Ana uygulama, kaldırıcı ve kurulum EXE'sinin imzaları/zaman damgası ayrıca doğrulanmalıdır. İmza sonrasında dosya özeti değişir; önceki imzasız paketin SHA256'sı yeni paket için kullanılamaz.

## Yerel test sertifikası

RiaCoding adına kendi oluşturduğumuz sertifikayla test imzası yapılabilir. Bu **kamusal olarak güvenilen yayıncı sertifikası değildir**; Windows/SmartScreen uyarılarının kalkmasını sağlamaz. Kriptografik imza bütünlüğü ile Windows güven zinciri sonucu ayrı raporlanmalıdır. Sistem güven depolarına otomatik sertifika yüklenmez.

Kaynaklar: [Microsoft Authenticode ve zaman damgası](https://learn.microsoft.com/en-us/windows/win32/seccrypto/time-stamping-authenticode-signatures), [electron-builder imzalama](https://www.electron.build/code-signing).
