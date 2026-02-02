#!/bin/bash

echo "🧪 Probando endpoints de GEOREF..."
echo ""

BASE_URL="http://localhost:3005"

echo "1️⃣  GET /api/georef/provincias"
curl -s "$BASE_URL/api/georef/provincias" | jq '.provincias | length'
echo ""

echo "2️⃣  GET /api/georef/provincias/06/ciudades (Buenos Aires)"
curl -s "$BASE_URL/api/georef/provincias/06/ciudades" | jq '{provincia: .provincia.nombre, total_ciudades: (.ciudades | length)}'
echo ""

echo "3️⃣  GET /api/georef/ciudades?search=Córdoba&limit=5"
curl -s "$BASE_URL/api/georef/ciudades?search=Córdoba&limit=5" | jq '.ciudades | map({nombre, provincia: .provincia.nombre})'
echo ""

echo "✅ Pruebas completadas"
