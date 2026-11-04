export const migration7 = `
CREATE TABLE preorders (
 id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES customers(id), product_id INTEGER NOT NULL REFERENCES products(id),
 product TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('Kg','Litre','Adet')),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000000000000),
 price INTEGER NOT NULL CHECK(price BETWEEN 0 AND 1000000000000), total INTEGER NOT NULL CHECK(total BETWEEN 0 AND 1000000000000),
 source TEXT NOT NULL CHECK(source IN ('prepaid','other')), note TEXT NOT NULL, reference TEXT NOT NULL, planned_on TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE TABLE preorder_events (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES preorders(id),
 kind TEXT NOT NULL CHECK(kind IN ('preorder_allocate','preorder_unallocate','preorder_delivery','preorder_return','preorder_cancel')),
 quantity INTEGER NOT NULL DEFAULT 0, amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0), reserve_delta INTEGER NOT NULL DEFAULT 0,
 sale_id INTEGER UNIQUE REFERENCES sales(id), collection_id INTEGER REFERENCES collections(id),
 reverses_id INTEGER UNIQUE REFERENCES preorder_events(id), note TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;
CREATE INDEX preorder_customer ON preorders(customer_id);
CREATE INDEX preorder_events_order ON preorder_events(order_id);
CREATE INDEX preorder_events_collection ON preorder_events(collection_id);
CREATE TABLE preorder_funding (
 event_id INTEGER NOT NULL REFERENCES preorder_events(id), allocation_id INTEGER NOT NULL REFERENCES preorder_events(id),
 paid_delta INTEGER NOT NULL, reserve_delta INTEGER NOT NULL, PRIMARY KEY(event_id,allocation_id)
) STRICT;
CREATE VIEW preorder_summary AS
 WITH e AS (SELECT order_id,
 COALESCE(SUM(CASE WHEN kind='preorder_delivery' THEN quantity WHEN kind='preorder_return' THEN -quantity ELSE 0 END),0) delivered,
 COALESCE(SUM(CASE WHEN kind='preorder_cancel' THEN quantity ELSE 0 END),0) cancelled,
 COALESCE(SUM(CASE WHEN kind='preorder_delivery' THEN amount WHEN kind='preorder_return' THEN -amount ELSE 0 END),0) recognized,
 COALESCE(SUM(CASE WHEN kind='preorder_cancel' THEN amount ELSE 0 END),0) cancelled_value,
 COALESCE(SUM(CASE WHEN kind='preorder_allocate' THEN amount WHEN kind='preorder_unallocate' THEN -amount WHEN kind='preorder_cancel' THEN reserve_delta ELSE 0 END),0) paid,
 COALESCE(SUM(reserve_delta),0) reserved
 FROM preorder_events GROUP BY order_id)
 SELECT o.*,c.name customer,p.stock,COALESCE((SELECT SUM(amount) FROM customer_ledger l WHERE l.customer_id=o.customer_id),0) free_balance,COALESCE(e.delivered,0) delivered,COALESCE(e.cancelled,0) cancelled,
 o.quantity-COALESCE(e.delivered,0)-COALESCE(e.cancelled,0) remaining,
 o.total-COALESCE(e.cancelled_value,0) target,COALESCE(e.recognized,0) recognized,
 COALESCE(e.paid,0) paid,COALESCE(e.reserved,0) reserved
 FROM preorders o JOIN customers c ON c.id=o.customer_id JOIN products p ON p.id=o.product_id LEFT JOIN e ON e.order_id=o.id;
`;
