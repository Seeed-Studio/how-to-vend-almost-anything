#!/bin/sh

BASE="${VENDING_BASE:-http://localhost:3001}"

echo "Health:"
curl -s "$BASE/health"
echo
echo

echo "Direct card check (card balance):"
curl -s -X POST "$BASE/machine/card-check" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "hardware_uid=11%204A%2047%20A0&card_uid=11%204A%2047%20A0&user_name=Matthew&balance=20.00"
echo
echo

echo "Prepaid card check:"
curl -s -X POST "$BASE/machine/card-check" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data "hardware_uid=17%206C%20EE%20EA&card_uid=17%206C%20EE%20EA&user_name=Alice&order_number=ORD-001&collection_status=ready&balance=0"
echo
echo

echo "Create writer job:"
curl -s -X POST "$BASE/api/rfid-writer/jobs" \
  -H "Content-Type: application/json" \
  -H "x-api-key: WIO_WRITER_SECRET" \
  --data '{"job_type":"full_write","card_uid":"11 4A 47 A0","user_name":"Matthew","balance":20}'
echo
echo
