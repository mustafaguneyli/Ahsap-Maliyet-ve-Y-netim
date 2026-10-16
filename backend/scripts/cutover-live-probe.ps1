$ErrorActionPreference = 'Continue'
$base = 'https://zirve-ahsap-backend-wu6qaogkka-ew.a.run.app'
$report = [ordered]@{}

function Invoke-Api {
  param([string]$Method, [string]$Path, $Body, [int]$TimeoutSec = 120)
  $uri = "$base$Path"
  $params = @{ Uri = $uri; Method = $Method; TimeoutSec = $TimeoutSec }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = ($Body | ConvertTo-Json -Depth 20 -Compress)
  }
  try {
    $resp = Invoke-WebRequest @params -UseBasicParsing
    return @{ ok = $true; code = [int]$resp.StatusCode; json = ($resp.Content | ConvertFrom-Json); raw = $resp.Content; headers = $resp.Headers }
  } catch {
    $ex = $_.Exception
    $code = 0
    $raw = $ex.Message
    if ($ex.Response) {
      $code = [int]$ex.Response.StatusCode
      try {
        $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
        $raw = $reader.ReadToEnd()
      } catch {}
    }
    $json = $null
    try { $json = $raw | ConvertFrom-Json } catch {}
    return @{ ok = $false; code = $code; json = $json; raw = $raw }
  }
}

function Pick-Row($rows, $w, $l) {
  foreach ($r in $rows) {
    if ([int]$r.widthCm -eq $w -and [int]$r.lengthCm -eq $l) { return $r }
    if ("$($r.widthCm)x$($r.lengthCm)" -eq "${w}x${l}") { return $r }
  }
  return $null
}

Write-Output '--- READS ---'
$groups = Invoke-Api GET '/product-groups'
$materials = Invoke-Api GET '/raw-materials'
$yields = Invoke-Api GET '/production-yields'
$pricingDf = Invoke-Api GET '/pricing-settings/door-frame/34_MM'
$pricingPervaz = Invoke-Api GET '/pricing-settings/pervaz/AYARLI_PERVAZ'
$extras = Invoke-Api GET '/extra-costs?productGroup=door_frame'
$catalog = Invoke-Api GET '/order-documents/catalog'
$report.reads = @{
  groups = @{ code = $groups.code; count = @($groups.json.items).Count }
  materials = @{ code = $materials.code; count = @($materials.json).Count }
  yields = @{ code = $yields.code; count = @($yields.json).Count }
  pricing34 = $pricingDf.code
  pricingPervaz = $pricingPervaz.code
  extras = $extras.code
  catalog = $catalog.code
}
Write-Output ($report.reads | ConvertTo-Json -Compress)

Write-Output '--- DOOR FRAME ---'
$df = Invoke-Api GET '/cost-calculation/door-frame/mdf?variant=34_MM'
$dfRows = @($df.json.rows)
$sizes = @()
foreach ($pair in @(@(10,210), @(11,210), @(12,210))) {
  $row = Pick-Row $dfRows $pair[0] $pair[1]
  $sizes += @{
    size = "$($pair[0])x$($pair[1])"
    found = [bool]$row
    productionCost = $row.productionCost
    profitRate = $row.pricing.profitRate
    cashSale = $row.pricing.cashSalePrice
    cardSale = $row.pricing.cardSalePrice
  }
}
$report.doorFrame = @{ code = $df.code; variant = $df.json.variant; profitRate = $df.json.profitRate; sizes = $sizes }
Write-Output ($report.doorFrame | ConvertTo-Json -Compress)

Write-Output '--- PERVAZ ---'
$ayarli = Invoke-Api GET '/cost-calculation/pervaz/ayarli'
$deko = Invoke-Api GET '/cost-calculation/pervaz/dekoratif'
$genis = Invoke-Api GET '/cost-calculation/pervaz/dekoratif-genis-kilcik'
$report.pervaz = @{
  ayarli = @{ code = $ayarli.code; rows = @($ayarli.json.rows).Count; sample = @($ayarli.json.rows | Select-Object -First 1 | ForEach-Object { @{ t=$_.thicknessMm; w=$_.widthMm; l=$_.lengthMm; pc=$_.productionCost; cash=$_.pricing.cashSalePrice; card=$_.pricing.cardSalePrice } }) }
  dekoratif = @{ code = $deko.code; rows = @($deko.json.rows).Count }
  genis = @{ code = $genis.code; rows = @($genis.json.rows).Count }
}
Write-Output ($report.pervaz | ConvertTo-Json -Compress)

Write-Output '--- SUPURGELIK ---'
$sup = @{}
foreach ($code in @('DUZ_SUPURGELIK','DEKORATIF_SUPURGELIK','DUZ_PP_SARMA_SUPURGELIK','DEKORATIF_PP_SARMA_SUPURGELIK')) {
  $r = Invoke-Api GET "/cost-calculation/supurgelik?productCode=$code"
  $rows = @($r.json.rows)
  $zero = @($rows | Where-Object { $_.pricing.cashSalePrice -eq '0' -or $_.productionCost -eq '0' }).Count
  $missing = @($rows | Where-Object { $_.missingReason -or $_.unresolvedMessage -or $_.statusCode -match 'MISSING' }).Count
  $sup[$code] = @{ code = $r.code; rows = $rows.Count; zero = $zero; sampleMissing = ($rows | Select-Object -First 1).missingReason }
}
$report.supurgelik = $sup
Write-Output ($report.supurgelik | ConvertTo-Json -Compress)

Write-Output '--- CITA ---'
$cita = Invoke-Api GET '/cost-calculation/cita/list'
$citaRows = @($cita.json.rows)
$report.cita = @{
  code = $cita.code
  rows = $citaRows.Count
  hasPublished = [bool]($citaRows | Where-Object { $_.publishedCashPrice -or $_.pricing.publishedCashPrice -or $_.cashSalePrice })
  sample = ($citaRows | Select-Object -First 1)
}
Write-Output ("cita http=$($cita.code) rows=$($citaRows.Count)")

Write-Output '--- PRICE LIST ---'
$pl = Invoke-Api GET '/price-list'
$plGroups = @($pl.json.groups)
$report.priceList = @{
  code = $pl.code
  groups = @($plGroups | ForEach-Object { $_.code })
  rowCount = $pl.json.rowCount
  missingCount = $pl.json.missingCount
}
Write-Output ($report.priceList | ConvertTo-Json -Compress)

Write-Output '--- EXISTING ORDERS ---'
$orders = Invoke-Api GET '/order-documents'
$orderItems = @($orders.json.items)
if (-not $orderItems.Count) { $orderItems = @($orders.json) }
$existing = @()
foreach ($o in ($orderItems | Select-Object -First 8)) {
  $id = $o.id
  $detail = Invoke-Api GET "/order-documents/$id"
  $print = Invoke-Api GET "/order-documents/$id/prints/combined.html"
  $html = [string]$print.raw
  $workshopHasPrice = $false
  if ($html -match 'ÜRETİM' -or $html -match 'uretim' -or $html -match 'ATÖLYE' -or $html -match 'workshop') {
    # production section leak heuristic: unit price near workshop heading is inspected later
  }
  $existing += @{
    id = $id
    number = $o.orderNumber
    detail = $detail.code
    snapshotGross = $detail.json.grossTotal
    print = $print.code
    printLen = $html.Length
  }
}
$report.existingOrders = @{ listCode = $orders.code; count = $orderItems.Count; checked = $existing }
Write-Output ("orders list=$($orders.code) count=$($orderItems.Count)")

# Generic recipe: pick an active material
$mat = @($materials.json) | Select-Object -First 1
$report.generic = @{}
if ($mat) {
  Write-Output '--- GENERIC PREVIEW/SAVE ---'
  $previewBody = @{
    newGroupCode = 'TEST_CUTOVER_GROUP'
    productGroupName = 'Cutover Test Grup'
    productCode = 'TEST_CUTOVER_PRODUCT'
    productName = 'Cutover Test Ürün'
    productUnit = 'ADET'
    widthMm = 80
    lengthMm = 2100
    displayName = '8×210'
    recipeItems = @(
      @{
        rawMaterialId = $mat.id
        calculationMode = 'PER_SHEET_YIELD'
        quantity = '1'
        newNetQty = 18
        pieceWidthMm = 80
        pieceLengthMm = 2100
        sortOrder = 1
      }
    )
    extraCosts = @(
      @{ typeCode = 'CUTTING'; amount = '5'; calculationMode = 'FIXED'; scope = 'GROUP' }
    )
    profitRate = '20'
  }
  $preview = Invoke-Api POST '/cost-calculation/generic-preview' $previewBody
  $save = Invoke-Api POST '/cost-calculation/catalog-items' @{
    mode = 'NEW_GROUP'
    newGroupCode = 'TEST_CUTOVER_GROUP'
    newGroupName = 'Cutover Test Grup'
    newProductCode = 'TEST_CUTOVER_PRODUCT'
    productName = 'Cutover Test Ürün'
    productUnit = 'ADET'
    widthMm = 80
    lengthMm = 2100
    displayName = '8×210'
    recipeItems = $previewBody.recipeItems
    extraCosts = $previewBody.extraCosts
    reason = 'Cutover live write test'
  }
  $dup = Invoke-Api POST '/cost-calculation/catalog-items' @{
    mode = 'NEW_GROUP'
    newGroupCode = 'TEST_CUTOVER_GROUP'
    newGroupName = 'Cutover Test Grup'
    newProductCode = 'TEST_CUTOVER_PRODUCT'
    productName = 'Cutover Test Ürün'
    productUnit = 'ADET'
    widthMm = 80
    lengthMm = 2100
    recipeItems = $previewBody.recipeItems
    reason = 'duplicate unique guard'
  }
  $list = Invoke-Api GET '/cost-calculation/generic?productGroupCode=TEST_CUTOVER_GROUP'
  $report.generic = @{
    preview = $preview.code
    save = $save.code
    saveMode = $save.json.mode
    recipeId = $save.json.recipeId
    productId = $save.json.productId
    uniqueDup = $dup.code
    list = $list.code
    listRows = @($list.json.rows).Count
    previewRaw = $preview.raw.Substring(0, [Math]::Min(400, $preview.raw.Length))
    saveRaw = $save.raw.Substring(0, [Math]::Min(500, $save.raw.Length))
    dupRaw = $dup.raw.Substring(0, [Math]::Min(300, $dup.raw.Length))
  }
  Write-Output ($report.generic | ConvertTo-Json -Compress)
}

Write-Output '--- PROFIT OVERRIDE ---'
$before = Invoke-Api GET '/cost-calculation/door-frame/mdf?variant=34_MM'
$before10 = Pick-Row @($before.json.rows) 10 210
$before11 = Pick-Row @($before.json.rows) 11 210
$ov = Invoke-Api POST '/pricing-settings/profit-rate' @{
  productGroupCode = 'door_frame'
  productCode = '34_MM'
  widthMm = 100
  lengthMm = 2100
  profitRate = '25'
  reason = 'Cutover profit override test 20->25'
}
$after = Invoke-Api GET '/cost-calculation/door-frame/mdf?variant=34_MM'
$after10 = Pick-Row @($after.json.rows) 10 210
$after11 = Pick-Row @($after.json.rows) 11 210
$restore = Invoke-Api POST '/pricing-settings/profit-rate' @{
  productGroupCode = 'door_frame'
  productCode = '34_MM'
  widthMm = 100
  lengthMm = 2100
  profitRate = $before.json.profitRate
  reason = 'Cutover profit override restore'
}
# If original was product-level not size, restore by clearing size override
if ($restore.json.changed -eq $false -or $ov.json.profitRate -eq $after10.pricing.profitRate) {
  $clear = Invoke-Api POST '/pricing-settings/profit-rate' @{
    productGroupCode = 'door_frame'
    productCode = '34_MM'
    widthMm = 100
    lengthMm = 2100
    profitRate = $null
    reason = 'Cutover profit override clear size'
  }
} else { $clear = $restore }
$final = Invoke-Api GET '/cost-calculation/door-frame/mdf?variant=34_MM'
$final10 = Pick-Row @($final.json.rows) 10 210
$report.profit = @{
  ov = $ov.code
  ovMsg = $ov.json.message
  ovSource = $ov.json.source
  ovRate = $ov.json.profitRate
  before10 = @{ pc = $before10.productionCost; pr = $before10.pricing.profitRate; cash = $before10.pricing.cashSalePrice }
  after10 = @{ pc = $after10.productionCost; pr = $after10.pricing.profitRate; cash = $after10.pricing.cashSalePrice }
  after11same = ($after11.pricing.cashSalePrice -eq $before11.pricing.cashSalePrice)
  restore = $restore.code
  clear = $clear.code
  final10pr = $final10.pricing.profitRate
  ovRaw = $ov.raw.Substring(0, [Math]::Min(400, $ov.raw.Length))
}
Write-Output ($report.profit | ConvertTo-Json -Compress)

Write-Output '--- ORDER CREATE ---'
$createOrder = Invoke-Api POST '/order-documents' @{
  customerName = 'CUTOVER TEST'
  vatRate = '0.20'
  documentDateText = '08.10.2026'
  lines = @(
    @{
      kind = 'FREE_TEXT'
      productNameText = 'Cutover test satiri'
      quantity = '1'
      unitText = 'ADET'
      discountRate = '0'
      unitPrice = '100'
      priceSource = 'ENTERED'
    }
  )
}
$orderId = $createOrder.json.id
$orderNo = $createOrder.json.orderNumber
$detail1 = if ($orderId) { Invoke-Api GET "/order-documents/$orderId" } else { @{ code = 0 } }
$update = if ($orderId) {
  Invoke-Api PUT "/order-documents/$orderId" @{
    customerName = 'CUTOVER TEST UPDATED'
    vatRate = '0.20'
    documentDateText = '08.10.2026'
    lines = @(
      @{
        kind = 'FREE_TEXT'
        productNameText = 'Cutover test satiri'
        quantity = '2'
        unitText = 'ADET'
        discountRate = '0'
        unitPrice = '100'
        priceSource = 'ENTERED'
      }
    )
  }
} else { @{ code = 0 } }
$printNew = if ($orderId) { Invoke-Api GET "/order-documents/$orderId/prints/combined.html" } else { @{ code = 0; raw = '' } }
$workshop = if ($orderId) { Invoke-Api GET "/order-documents/$orderId/prints/workshop-material.html" } else { @{ code = 0; raw = '' } }
$workshopHtml = [string]$workshop.raw
$priceLeak = $false
if ($workshopHtml -match '100' -and $workshopHtml -match 'TL') { $priceLeak = $true }
$report.order = @{
  create = $createOrder.code
  number = $orderNo
  id = $orderId
  detail = $detail1.code
  snapshotGross = $detail1.json.grossTotal
  update = $update.code
  updateName = $update.json.customerName
  print = $printNew.code
  workshop = $workshop.code
  workshopLeak = $priceLeak
  createRaw = $createOrder.raw.Substring(0, [Math]::Min(400, $createOrder.raw.Length))
}
Write-Output ($report.order | ConvertTo-Json -Compress)

Write-Output '--- DOOR BUILD ---'
$surface = @($materials.json) | Where-Object { $_.code -match '16' -and $_.sheetWidthMm -eq 2100 } | Select-Object -First 1
if (-not $surface) { $surface = @($materials.json) | Select-Object -First 1 }
$dbQuote = Invoke-Api POST '/door-build/quote' @{
  doorHeightMm = 2100
  doorWidthMm = 900
  quantity = 1
  surfaceRawMaterialId = $surface.id
  frame = @{
    productCode = '34_MM'
    widthMm = 100
    lengthMm = 2100
    totalBoyQuantity = '2.5'
  }
  sideTrims = @{
    productCode = 'AYARLI_PERVAZ'
    thicknessMm = '12'
    widthMm = '100'
    lengthMm = '2200'
  }
  manualCostLines = @()
  profitRate = '20'
  vatRate = '20'
  cardMarkupRate = '10'
}
$wsPrev = Invoke-Api POST '/door-build/workshop-preview' @{
  doorHeightMm = 2100
  doorWidthMm = 900
  quantity = 1
  surfaceRawMaterialId = $surface.id
  manualCostLines = @()
}
$wsHtml = [string]$wsPrev.raw
if (-not $wsHtml) { $wsHtml = [string]($wsPrev.json.html) }
$report.doorBuild = @{
  surface = $surface.code
  quote = $dbQuote.code
  frame = $dbQuote.json.frame.status
  frameCost = $dbQuote.json.frame.lineTotal
  cash = $dbQuote.json.cashSale
  card = $dbQuote.json.cardSale
  workshop = $wsPrev.code
  quoteRaw = $dbQuote.raw.Substring(0, [Math]::Min(500, $dbQuote.raw.Length))
}
Write-Output ($report.doorBuild | ConvertTo-Json -Compress)

Write-Output '--- GENERIC DEACTIVATE ---'
if ($save.json.productGroupCode -or $report.generic.save -eq 201 -or $report.generic.save -eq 200) {
  $deact = Invoke-Api POST '/cost-calculation/catalog-items/deactivate' @{
    target = 'GROUP'
    productGroupCode = 'TEST_CUTOVER_GROUP'
    reason = 'Cutover live test soft deactivate'
  }
  $report.generic.deactivate = $deact.code
  $report.generic.deactivateRaw = $deact.raw.Substring(0, [Math]::Min(300, $deact.raw.Length))
  Write-Output ("deactivate=$($deact.code)")
}

$report | ConvertTo-Json -Depth 8
