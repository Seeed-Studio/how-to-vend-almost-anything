// Bridges the remote-defined CSV schemas to the rich objects this server uses.
//
// The remote/reference project owns the canonical shapes of these files:
//   cards.csv     -> card_uid,user_name,mode,balance
//   inventory.csv -> product_id,name,servo_id,stock,price
//
// This server needs more attributes than those columns hold, so the extra
// fields live in side files (add, don't modify the remote schema):
//   product_meta.csv -> per-product display/config fields
//   card_meta.csv    -> per-card lifecycle fields
//
// readProducts/readCards join the two halves back into the objects the rest of
// server.mjs already expects; writeProducts/writeCards split them apart again.

import { readCsv, writeCsv } from './csvStore.mjs';

// Canonical (remote) schemas.
export const inventoryHeaders = ['product_id', 'name', 'servo_id', 'stock', 'price'];
export const cardHeaders = ['card_uid', 'user_name', 'mode', 'balance'];

// Add-on schemas for fields that do not fit the remote shape.
export const productMetaHeaders = ['product_id', 'slot_id', 'low_stock_threshold', 'max_capacity', 'active', 'tag', 'description', 'feature_1', 'feature_2', 'feature_3', 'image_path', 'product_url'];
export const cardMetaHeaders = ['card_uid', 'status', 'created_at', 'updated_at', 'last_payload', 'notes'];

export const DEFAULT_CARD_MODE = 'DIRECT';

// ---------------- Products ----------------
export async function readProducts() {
  const [inventory, meta] = await Promise.all([readCsv('inventory.csv'), readCsv('product_meta.csv')]);
  const metaById = new Map(meta.map(m => [m.product_id, m]));
  return inventory.map(row => {
    const m = metaById.get(row.product_id) || {};
    return {
      product_id: row.product_id,
      product_name: row.name,
      servo_id: row.servo_id,
      price: row.price,
      inventory: row.stock,
      slot_id: m.slot_id || '',
      low_stock_threshold: m.low_stock_threshold || '0',
      max_capacity: m.max_capacity || '10',
      active: m.active || 'true',
      tag: m.tag || '',
      description: m.description || '',
      feature_1: m.feature_1 || '',
      feature_2: m.feature_2 || '',
      feature_3: m.feature_3 || '',
      image_path: m.image_path || '',
      product_url: m.product_url || ''
    };
  });
}

export async function writeProducts(products) {
  const inventory = products.map(p => ({
    product_id: p.product_id,
    name: p.product_name,
    servo_id: p.servo_id,
    stock: p.inventory,
    price: p.price
  }));
  const meta = products.map(p => ({
    product_id: p.product_id,
    slot_id: p.slot_id,
    low_stock_threshold: p.low_stock_threshold,
    max_capacity: p.max_capacity,
    active: p.active,
    tag: p.tag,
    description: p.description,
    feature_1: p.feature_1,
    feature_2: p.feature_2,
    feature_3: p.feature_3,
    image_path: p.image_path,
    product_url: p.product_url
  }));
  await Promise.all([
    writeCsv('inventory.csv', inventory, inventoryHeaders),
    writeCsv('product_meta.csv', meta, productMetaHeaders)
  ]);
}

// ---------------- Cards ----------------
export async function readCards() {
  const [cards, meta] = await Promise.all([readCsv('cards.csv'), readCsv('card_meta.csv')]);
  const metaByUid = new Map(meta.map(m => [m.card_uid, m]));
  return cards.map(row => {
    const m = metaByUid.get(row.card_uid) || {};
    return {
      card_uid: row.card_uid,
      user_name: row.user_name,
      mode: row.mode || DEFAULT_CARD_MODE,
      balance: row.balance,
      status: m.status || 'ACTIVE',
      created_at: m.created_at || '',
      updated_at: m.updated_at || '',
      last_payload: m.last_payload || '',
      notes: m.notes || ''
    };
  });
}

export async function writeCards(cards) {
  const base = cards.map(c => ({
    card_uid: c.card_uid,
    user_name: c.user_name,
    mode: c.mode || DEFAULT_CARD_MODE,
    balance: c.balance
  }));
  const meta = cards.map(c => ({
    card_uid: c.card_uid,
    status: c.status || 'ACTIVE',
    created_at: c.created_at || '',
    updated_at: c.updated_at || '',
    last_payload: c.last_payload || '',
    notes: c.notes || ''
  }));
  await Promise.all([
    writeCsv('cards.csv', base, cardHeaders),
    writeCsv('card_meta.csv', meta, cardMetaHeaders)
  ]);
}
