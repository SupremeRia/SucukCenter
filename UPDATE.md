# Yerinde güncelleme ve geri dönüş

Aynı EXE hem tam kurulum hem yerinde güncellemedir. Ayrı bir delta/otomatik güncelleme dosyası yoktur.

1. Güncel uygulamada Ayarlar → Veriler ve yedekleme → **Yedek Oluştur** ile doğrulanmış yedek alın; başka diskte saklayabilirsiniz.
2. SucukCenter’ı normal biçimde kapatın. Kurulumu önceden kaldırmayın. Yeni EXE ile mevcut konuma kurun.
3. Uygulama kimliği, SucukCenter.exe adı ve gerçek Belgeler veri konumu korunur. İlk açılışta şema 10 → 11 öncesinde doğrulanmış geçiş yedeği oluşturulur. Eski açık/koyu tercihi sırasıyla Açık Gri/Sucuk Klasik’e taşınır.
4. İşlem sonrası stok, müşteri bakiyesi, bekleyen teslimat, gider ve ayarları kontrol edin.

Bir kayıt yedeğine dönmek için Ayarlar → Yedekten Geri Yükle kullanın. Mevcut veriler için önce güvenli geri dönüş yedeği alınır; kullanıcının onayı olmadan mevcut kayıtlar değiştirilmez. Eski yedek yeni uygulamada güvenli migration’dan geçirilir.

**Eski uygulamayı yeni şemalı dosyayla açmayın.** Eski sürüm daha yeni şemayı reddeder. Hem eski uygulamaya hem eski veriye geri dönüş gerekiyorsa geçiş öncesi yedeği ayrı, izole bir ortamda kullanın; yeni dosyanın üzerine elle kopyalamayın. Yardım gerektiren durumda mevcut dosyaları koruyup yayıncıya başvurun.

Gerçek 1.7.0 kaynak/paket kodu ile sentetik veri yükseltmesi test edilmiştir. Bu, kurulu eski NSIS uygulaması üzerine fiziksel kurulum testi değildir. O kontrol tamamlanmadığından 1.8.0-rc.1 önizleme olarak yayınlanır.
