# Kullanım kılavuzu

## Çalışma alanı

Soldaki dar şerit ana modüllere hızlı erişir. Yanındaki menü Genel Bakış, Stok ve Ürünler, Müşteri İşlemleri, Finans ve Sistem gruplarını içerir. Menü daraltma düğmesiyle içerik alanını genişletebilirsiniz. Dar pencerede ikonlar üzerine gelerek modül adını görün. Her ekranın başlığı ve kendi arama/tarih araçları vardır.

## Temalar ve açılış

Ayarlar → Görünüm’de 16 düz ve 4 geçişli tema bulunur. Kutucuğa tıklamak önizler; **Uygula** kalıcı kaydeder; **Vazgeç** kayıtlı temaya döner. Sistem temasını takip et açıkken Windows renk tercihi izlenir. Belirli tema seçiliyken sistem değişimi bu seçimi ezmez. Temayı değiştirmek açık işlem formunu veya rapor dönemini sıfırlamaz.

Açılışta yalnız tam yazılı Sucuk Center logosu görünür; menülerde ayrı SC sembolü kullanılır. Görünür ilk kareden sonra en az yedi saniye beklenir; veriler hazır değilse bekleme uzar. Logoya tıklamak süreyi atlamaz. Hazırlık hatasında çıkış/yeniden deneme sunulur. İkinci çalıştırma mevcut pencereye yönelir. Pencere bölgesi API’si deneysel olduğundan gerçek şeffaf alan fare geçişi henüz onaylanmamıştır.

## Ürün, alış ve stok

Ürün Yönetimi’nde ürün adı, Kg/Litre/Adet, satış fiyatı ve kritik stok sınırı belirlenir. Gelen Siparişler’de gerçek tedarikçi, ürün kalemleri, miktar, alış fiyatı ve işlem tarihi girilir. Alış ürün miktarını ve stok maliyetini artırır; tek başına faaliyet zararı değildir. Depo ve Stok hareketleri ve kritik stokları gösterir. Fire/kayıp gerekçeli stok çıkışıdır.

## Müşteri, satış ve cari

Müşteriler’de firma/yetkili/telefon araması ve başlık sıralaması kullanılır. Hesabı aç ile satışlar, tahsilatlar ve tüm hareketler izlenir. Satışta müşteri ve ürün seçilir; miktar ve yetkili birim fiyatı girilir. Kaydetme stok, satış maliyeti ve müşteri borcunu birlikte günceller. Yetersiz stokta bütün işlem reddedilir.

Tahsilat müşteri borcunu azaltır, ödeme girişini oluşturur. Borçtan fazla ödeme kullanılabilir avans/alacaktır. Cari borç/alacak eklemesi satış veya ödeme yaratmadan bakiye değiştirir. Müşteriye gerçekten ödeme yapıldığında ayrıca para iadesi akışı kullanılır.

## Ön sipariş ve teslimat

Bekleyen Teslimatlar’da ön ödemeli sipariş veya diğer ürün borcu oluşturulur. Ön siparişin anlaşılmış fiyatı sonradan ürün kartı değişse de korunur. Yeni ödeme, mevcut tahsilat veya avans tahsis edilebilir; aynı ödeme iki kez kasaya girmez. Kısmi teslimat gerçek stoktan düşer ve kalan ürün yükümlülüğünü azaltır. Para bakiyesi ile ürün teslim borcu ayrı izlenir. Bağlantılı ödeme/teslim hareketi olan kayıtta güvenli düzeltme koşulları ekranda açıklanır.

## Giderler ve finans

Giderler’e gerçekleşmiş ve ödenmiş kira, elektrik, mazot veya serbest isimli başka harcama girilir. Tarih, tutar ve ödeme yöntemi gerekir; açıklama isteğe bağlıdır. Tarih/ad filtresi toplamı ve tüm zamanlar toplamı ayrıdır. Stok ve müşteri bakiyesi değişmez. Hatalı gider iptali özgün dönemi düzeltir; gerçekten geri alınan tam gider kendi iade tarihinde ters etki oluşturur. Kısmi gider iadesi henüz yoktur.

Brüt satış kârı net satıştan satılan mal maliyetinin düşülmesidir. Net sonuçta işletme gideri, fire, diğer ürün borcu teslim maliyeti ve mevcut tedarikçi iade farkları birer kez hesaba katılır. Tahsilat kâr değildir. Net satış sıfır/negatifse marj Hesaplanamıyor olur. Aylık/yıllık rapor ve müşteri ekstresi ortak işlem tarihlerine dayanır.

## Geçmiş, düzeltme ve yedek

Sağ tık, üç nokta veya Shift+F10 ile kayıt görüntülenir/düzeltilir/iptal edilir. Düzeltmede gerekçe ve önce/sonra karşılaştırması vardır. Özgün kayıt silinmez; bağlantılı ters/yeni kayıt oluşur. Hareketli müşteri/ürün kartı arşivlenir; yükümlülükleri kapanmaz. Kullanılmamış kart için kalıcı silme ayrı koşullara bağlıdır.

Geçmiş tarihli işlem sonraki maliyetleri etkiliyorsa önce önizleme ve açık onay alınır. Hata halinde form bilgileri kalır. Yeniden denemede aynı işlem anahtarı mükerrer mali kayıt oluşturmaz.

Ayarlar → Veriler ve yedekleme’den konum açılır, güvenli yedek oluşturulur veya onayla geri yüklenir. Kurtarma öncesinde mevcut veri için geri dönüş yedeği oluşturulur. Belgeler OneDrive altındaysa aynı veriyi iki bilgisayarda eşzamanlı açmayın.
