export const migration6 = `
CREATE TABLE customer_adjustments (
 id INTEGER PRIMARY KEY,
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 kind TEXT NOT NULL CHECK(kind IN ('customer_debt','customer_credit')),
 amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND 1000000000000),
 category TEXT NOT NULL CHECK(category IN ('carry','other','credit')),
 note TEXT NOT NULL CHECK(length(trim(note))>0),
 reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((kind='customer_debt' AND category IN ('carry','other')) OR (kind='customer_credit' AND category='credit'))
) STRICT;
CREATE TRIGGER no_delete_customer_adjustments BEFORE DELETE ON customer_adjustments BEGIN SELECT RAISE(ABORT,'Cari kayıtlar silinemez'); END;
CREATE TRIGGER immutable_customer_adjustments BEFORE UPDATE ON customer_adjustments
 WHEN NEW.id<>OLD.id OR NEW.customer_id<>OLD.customer_id OR NEW.kind<>OLD.kind OR NEW.amount<>OLD.amount OR NEW.category<>OLD.category OR NEW.note<>OLD.note OR NEW.reference<>OLD.reference OR NEW.created_at<>OLD.created_at OR OLD.status<>'active' OR NEW.status<>'cancelled'
 BEGIN SELECT RAISE(ABORT,'Cari kayıt yalnız ters hareketle iptal edilebilir'); END;
`;
