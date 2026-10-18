# Acceptance test script for Hardware Store Inventory (spec §20 + price feature §10).
#
# Prerequisites:
#   1. XAMPP MySQL running, database initialized and migrated
#      (npm run db:init, then npm run db:migrate)
#   2. Owner seeded (npm run db:seed-owner)
#   3. Dev server running (npm run dev)
#
# Usage (from the project root) — the password is never stored in this repo:
#   $env:INVSYS_OWNER_PASSWORD = "your-owner-password"
#   powershell -ExecutionPolicy Bypass -File scripts\acceptance.ps1
#   (or pass -OwnerUsername / -OwnerPassword explicitly)
#
# The script mutates the database (creates test products and sales entries).
# It prints PASS/FAIL for every check and exits non-zero if anything failed.

param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$OwnerUsername = "carl",
  [string]$OwnerPassword = $env:INVSYS_OWNER_PASSWORD
)

if (-not $OwnerPassword) {
  Write-Host "Owner password not provided. Set INVSYS_OWNER_PASSWORD or pass -OwnerPassword." -ForegroundColor Yellow
  exit 1
}

$ErrorActionPreference = "Stop"
$script:Failures = 0
$script:Checks = 0

function Check([string]$Name, [bool]$Condition, [string]$Detail = "") {
  $script:Checks++
  if ($Condition) {
    Write-Host "PASS  $Name" -ForegroundColor Green
  } else {
    $script:Failures++
    Write-Host "FAIL  $Name  $Detail" -ForegroundColor Red
  }
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$origin = $BaseUrl

function Api([string]$Method, [string]$Path, $Body = $null) {
  $params = @{
    Method = $Method
    Uri = "$BaseUrl$Path"
    WebSession = $session
    Headers = @{ Origin = $origin }
    ContentType = "application/json"
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 10)
  }
  try {
    $response = Invoke-WebRequest @params -UseBasicParsing
    return @{ Status = $response.StatusCode; Json = ($response.Content | ConvertFrom-Json) }
  } catch {
    $webResponse = $_.Exception.Response
    if ($webResponse -and $webResponse.StatusCode) {
      $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Dispose()
      $status = [int]$webResponse.StatusCode
      $json = $null
      try { $json = $content | ConvertFrom-Json } catch { }
      return @{ Status = $status; Json = $json }
    }
    throw
  }
}

$suffix = Get-Date -Format "HHmmss"

Write-Host "`n== Auth ==" -ForegroundColor Cyan
$unauth = Api GET "/api/products"
Check "Unauthenticated API access is rejected" ($unauth.Status -eq 401) "got $($unauth.Status)"

$badLogin = Api POST "/api/auth/login" @{ username = $OwnerUsername; password = "wrong-password" }
Check "Wrong password is rejected" ($badLogin.Status -eq 401) "got $($badLogin.Status)"

$login = Api POST "/api/auth/login" @{ username = $OwnerUsername; password = $OwnerPassword }
Check "Owner can log in" ($login.Status -eq 200) "got $($login.Status) $(($login.Json | ConvertTo-Json -Compress))"

Write-Host "`n== Categories and products ==" -ForegroundColor Cyan
$catName = "Acceptance $suffix"
$category = Api POST "/api/categories" @{ name = $catName }
Check "Owner can create a category" ($category.Status -eq 201) "got $($category.Status)"
$categoryId = $category.Json.data.id

$dupCategory = Api POST "/api/categories" @{ name = $catName }
Check "Duplicate category is rejected" ($dupCategory.Status -eq 409) "got $($dupCategory.Status)"

$oilName = "Engine Oil 1L $suffix"
$product = Api POST "/api/products" @{
  name = $oilName; categoryId = $categoryId; sku = "OIL-$suffix"
  unit = "bottle"; sellingPrice = "350.00"; reorderLevel = "5"; openingStock = "20"
}
Check "Owner can add a product with starting stock 20" ($product.Status -eq 201) "got $($product.Status) $(($product.Json | ConvertTo-Json -Compress))"
$oilId = $product.Json.data.product.id
Check "Product stock starts at 20" ((Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "20.000")

$tire = Api POST "/api/products" @{
  name = "Tire 14-inch $suffix"; categoryId = $categoryId; unit = "piece"
  sellingPrice = "4200.00"; reorderLevel = "2"; openingStock = "2"
}
$tireId = $tire.Json.data.product.id
Check "Second product created (stock 2)" ($tire.Status -eq 201)

$dupSku = Api POST "/api/products" @{
  name = "Duplicate SKU attempt $suffix"; categoryId = $categoryId; sku = "OIL-$suffix"
  unit = "bottle"; sellingPrice = "1.00"; reorderLevel = "1"; openingStock = "0"
}
Check "Duplicate SKU is rejected" ($dupSku.Status -eq 409) "got $($dupSku.Status)"

$movements = Api GET "/api/stock-movements?productId=$oilId"
$firstMovement = $movements.Json.data[0]
Check "Opening stock has an 'opening' movement (20, before 0)" (
  $firstMovement.movementType -eq "opening" -and
  $firstMovement.quantityDelta -eq "20.000" -and
  $firstMovement.stockBefore -eq "0.000" -and
  $firstMovement.stockAfter -eq "20.000"
) "got $(($firstMovement | ConvertTo-Json -Compress))"

$editBadStock = Api PATCH "/api/products/$oilId" @{
  name = $oilName; categoryId = $categoryId; sku = "OIL-$suffix"
  unit = "bottle"; sellingPrice = "360.00"; reorderLevel = "5"; stockOnHand = "999"
}
$afterEdit = Api GET "/api/products/$oilId"
Check "Price edit works" ($editBadStock.Status -eq 200)
Check "Product edit cannot change stock (still 20)" ($afterEdit.Json.data.product.stockOnHand -eq "20.000") "got $($afterEdit.Json.data.product.stockOnHand)"

Write-Host "`n== Record daily sales ==" -ForegroundColor Cyan
$today = (Api GET "/api/dashboard").Json.data.today
$requestId = [guid]::NewGuid().ToString()

# Spec §10 example: catalog price is 360.00; the owner sold 3 bottles and
# recorded an actual final price of 320.00 each.
$sale = Api POST "/api/sales" @{
  saleDate = $today; requestId = $requestId; notes = "Acceptance run $suffix"
  items = @(
    @{ productId = $oilId; quantity = "3"; finalUnitPrice = "320.00" },
    @{ productId = $tireId; quantity = "1" }
  )
}
Check "Sale posts successfully (201)" ($sale.Status -eq 201) "got $($sale.Status) $(($sale.Json | ConvertTo-Json -Compress))"
$saleId = $sale.Json.data.sale.id
Check "Sale saleDate serializes as YYYY-MM-DD (post response)" ($sale.Json.data.sale.saleDate -eq $today) "got $($sale.Json.data.sale.saleDate)"
# Regression guard for the D-19 timezone fix: the DB must write UTC and the
# API must return it as UTC. A local-time write shows up as an ~8h drift.
$createdAtRaw = $sale.Json.data.sale.createdAt
$createdAtDriftMin = 999
if ($createdAtRaw) { $createdAtDriftMin = [math]::Abs((([datetime]$createdAtRaw).ToUniversalTime() - [datetime]::UtcNow).TotalMinutes) }
Check "Sale createdAt is true UTC (within 5 min of now; no +8h shift)" ($createdAtDriftMin -lt 5) "createdAt=$createdAtRaw drift=$([math]::Round($createdAtDriftMin, 2)) min"
$salesList = Api GET "/api/sales?page=1&pageSize=10"
Check "Sale saleDate serializes as YYYY-MM-DD (sales list)" (@($salesList.Json.data | Where-Object { $_.id -eq $saleId }).saleDate -eq $today) "got $(@($salesList.Json.data | Where-Object { $_.id -eq $saleId }).saleDate)"
$dashAfterSale = Api GET "/api/dashboard"
Check "Sale saleDate serializes as YYYY-MM-DD (dashboard)" (@($dashAfterSale.Json.data.recentBatches | Where-Object { $_.id -eq $saleId }).saleDate -eq $today) "got $(@($dashAfterSale.Json.data.recentBatches | Where-Object { $_.id -eq $saleId }).saleDate)"
$oilLine = $sale.Json.data.sale.items | Where-Object { $_.productId -eq $oilId }
$tireLine = $sale.Json.data.sale.items | Where-Object { $_.productId -eq $tireId }
Check "Line total is 3 x 320 = 960.00 (final price, not base)" ($oilLine.lineTotal -eq "960.00") "got $($oilLine.lineTotal)"
Check "Base price snapshot keeps the catalog price at posting time (360.00)" ($oilLine.baseUnitPrice -eq "360.00") "got $($oilLine.baseUnitPrice)"
Check "Final price snapshot stores the applied price (320.00)" ($oilLine.finalUnitPrice -eq "320.00") "got $($oilLine.finalUnitPrice)"
Check "Omitted finalUnitPrice defaults to the Base Price (4200.00)" (
  $tireLine.finalUnitPrice -eq "4200.00" -and $tireLine.lineTotal -eq "4200.00"
) "got $($tireLine | ConvertTo-Json -Compress)"
Check "Batch total is the sum of line totals (960 + 4200 = 5160.00)" ($sale.Json.data.sale.totalAmount -eq "5160.00") "got $($sale.Json.data.sale.totalAmount)"
Check "Engine oil stock 20 -> 17" ((Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "17.000")
Check "Tire stock 2 -> 1" ((Api GET "/api/products/$tireId").Json.data.product.stockOnHand -eq "1.000")
Check "Catalog price is untouched by the sales entry (still 360.00)" (
  (Api GET "/api/products/$oilId").Json.data.product.sellingPrice -eq "360.00"
) "got $((Api GET "/api/products/$oilId").Json.data.product.sellingPrice)"

# Invalid final prices are rejected with no stock change.
$negativePrice = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "1"; finalUnitPrice = "-5" })
}
Check "Negative final price is rejected" ($negativePrice.Status -eq 400) "got $($negativePrice.Status)"
$precisionPrice = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "1"; finalUnitPrice = "320.999" })
}
Check "Over-precision final price is rejected" ($precisionPrice.Status -eq 400) "got $($precisionPrice.Status)"
$malformedPrice = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "1"; finalUnitPrice = "abc" })
}
Check "Malformed final price is rejected" ($malformedPrice.Status -eq 400) "got $($malformedPrice.Status)"
Check "Rejected prices left stock unchanged (still 17)" (
  (Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "17.000"
)

# Legacy alias: pre-feature clients may still send unitPrice (documented
# compatibility window; finalUnitPrice always wins when both are present).
$legacy = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "1"; unitPrice = "300.00" })
}
$legacyLine = $legacy.Json.data.sale.items[0]
Check "Legacy unitPrice alias still posts (base 360.00, final 300.00)" (
  $legacy.Status -eq 201 -and
  $legacyLine.baseUnitPrice -eq "360.00" -and
  $legacyLine.finalUnitPrice -eq "300.00"
) "got $($legacy.Status) $($legacyLine | ConvertTo-Json -Compress)"
Check "Alias sale deducted stock (17 -> 16)" ((Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "16.000")
$legacyVoid = Api POST "/api/sales/$($legacy.Json.data.sale.id)/void" @{ reason = "Legacy alias test cleanup" }
Check "Alias sale voided; stock restored to 17" (
  $legacyVoid.Status -eq 200 -and
  (Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "17.000"
) "got $($legacyVoid.Status)"
$legacyDetail = Api GET "/api/sales/$($legacy.Json.data.sale.id)"
$legacyItem = $legacyDetail.Json.data.items[0]
Check "Voided alias line keeps its base/final snapshots" (
  $legacyItem.baseUnitPrice -eq "360.00" -and
  $legacyItem.finalUnitPrice -eq "300.00" -and
  $legacyItem.lineTotal -eq "300.00"
)

# A later catalog price edit must never rewrite posted snapshots.
$priceChange = Api PATCH "/api/products/$oilId" @{
  name = $oilName; categoryId = $categoryId; sku = "OIL-$suffix"
  unit = "bottle"; sellingPrice = "370.00"; reorderLevel = "5"; stockOnHand = "999"
}
$postChangeOilLine = (Api GET "/api/sales/$saleId").Json.data.items | Where-Object { $_.productId -eq $oilId }
Check "Catalog edit after posting leaves snapshots unchanged (360.00 / 320.00 / 960.00)" (
  $priceChange.Status -eq 200 -and
  $postChangeOilLine.baseUnitPrice -eq "360.00" -and
  $postChangeOilLine.finalUnitPrice -eq "320.00" -and
  $postChangeOilLine.lineTotal -eq "960.00"
)

$replay = Api POST "/api/sales" @{
  saleDate = $today; requestId = $requestId
  items = @(@{ productId = $oilId; quantity = "3"; finalUnitPrice = "320.00" }, @{ productId = $tireId; quantity = "1" })
}
Check "Repeated requestId does not deduct twice (stock still 17)" (
  $replay.Json.data.replayed -eq $true -and
  (Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "17.000"
)

$dupCheck = Api GET "/api/sales/duplicate-check?date=$today"
Check "Duplicate-date warning reports existing entries" ($dupCheck.Json.data.hasPostedEntries -eq $true)

$oversell = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $tireId; quantity = "5" })
}
Check "Oversell is rejected with INSUFFICIENT_STOCK" (
  $oversell.Status -eq 409 -and $oversell.Json.error.code -eq "INSUFFICIENT_STOCK"
) "got $($oversell.Status) $($oversell.Json.error.code)"
Check "No partial deduction after rejected batch (tire still 1)" (
  (Api GET "/api/products/$tireId").Json.data.product.stockOnHand -eq "1.000"
)

$zeroQty = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "0" })
}
Check "Zero quantity is rejected" ($zeroQty.Status -eq 400) "got $($zeroQty.Status)"

$futureDate = Api POST "/api/sales" @{
  saleDate = "2099-01-01"; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $oilId; quantity = "1" })
}
Check "Future sale date is rejected" ($futureDate.Status -eq 422) "got $($futureDate.Status)"

Write-Host "`n== Stock operations ==" -ForegroundColor Cyan
$stockIn = Api POST "/api/stock-movements/stock-in" @{ productId = $oilId; quantity = "10"; reason = "New delivery (acceptance)" }
Check "Stock-in adds quantity" (
  $stockIn.Status -eq 201 -and (Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "27.000"
) "got $($stockIn.Status)"
Check "Stock-in creates a positive stock_in movement" (
  $stockIn.Json.data.quantityDelta -eq "10.000" -and
  $stockIn.Json.data.stockBefore -eq "17.000" -and
  $stockIn.Json.data.stockAfter -eq "27.000"
)

$countDown = Api POST "/api/stock-movements/physical-count" @{ productId = $oilId; physicalCount = "25"; reason = "Physical count correction (acceptance)" }
Check "Physical count reduces stock with correct delta (-2)" (
  $countDown.Status -eq 201 -and
  $countDown.Json.data.quantityDelta -eq "-2.000" -and
  $countDown.Json.data.stockAfter -eq "25.000"
) "got $(($countDown.Json.data | ConvertTo-Json -Compress))"

$countZero = Api POST "/api/stock-movements/physical-count" @{ productId = $tireId; physicalCount = "0"; reason = "Sold but not recorded (acceptance)" }
Check "Physical count can set stock to zero" ($countZero.Json.data.stockAfter -eq "0.000")

$countNegative = Api POST "/api/stock-movements/physical-count" @{ productId = $oilId; physicalCount = "-5"; reason = "Negative attempt" }
Check "Negative physical count is rejected" ($countNegative.Status -eq 400) "got $($countNegative.Status)"

Write-Host "`n== Daily report ==" -ForegroundColor Cyan
$report = Api GET "/api/reports/daily?date=$today"
Check "Report is reachable" ($report.Status -eq 200)
$reportOilLine = $report.Json.data.productLines | Where-Object { $_.productName -eq $oilName }
Check "Report includes the sold product with quantity and unit" (
  $null -ne $reportOilLine -and $reportOilLine.unit -eq "bottle" -and [double]$reportOilLine.quantity -ge 3
)

Write-Host "`n== Void and audit ==" -ForegroundColor Cyan
$voidNoReason = Api POST "/api/sales/$saleId/void" @{ reason = "" }
Check "Void requires a reason" ($voidNoReason.Status -eq 400) "got $($voidNoReason.Status)"

$stockBeforeVoid = (Api GET "/api/products/$oilId").Json.data.product.stockOnHand
$tireBeforeVoid = (Api GET "/api/products/$tireId").Json.data.product.stockOnHand

$void = Api POST "/api/sales/$saleId/void" @{ reason = "Acceptance test void" }
Check "Void succeeds" ($void.Status -eq 200) "got $($void.Status)"
Check "Oil stock restored exactly once (25 -> 28)" ((Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "28.000")
Check "Tire stock restored exactly once (0 -> 1)" ((Api GET "/api/products/$tireId").Json.data.product.stockOnHand -eq "1.000")

$secondVoid = Api POST "/api/sales/$saleId/void" @{ reason = "Second void attempt" }
Check "Second void fails safely with no stock change" (
  $secondVoid.Status -eq 409 -and
  (Api GET "/api/products/$oilId").Json.data.product.stockOnHand -eq "28.000"
) "got $($secondVoid.Status)"

$reportAfterVoid = Api GET "/api/reports/daily?date=$today"
$voidedLine = $reportAfterVoid.Json.data.productLines | Where-Object { $_.productName -eq $oilName }
Check "Voided entry is excluded from report totals" ($null -eq $voidedLine)
Check "Voided entry is listed in the report's voided section" (
  @($reportAfterVoid.Json.data.voidedBatches | Where-Object { $_.id -eq $saleId }).Count -eq 1
)

$detail = Api GET "/api/sales/$saleId"
Check "Original sale lines remain for audit" (
  $detail.Json.data.status -eq "voided" -and $detail.Json.data.items.Count -eq 2 -and $detail.Json.data.voidReason -eq "Acceptance test void"
)
$voidedAtRaw = $detail.Json.data.voidedAt
$voidedAtDriftMin = 999
if ($voidedAtRaw) { $voidedAtDriftMin = [math]::Abs((([datetime]$voidedAtRaw).ToUniversalTime() - [datetime]::UtcNow).TotalMinutes) }
Check "Voided sale voidedAt is true UTC (within 5 min of now)" ($voidedAtDriftMin -lt 5) "voidedAt=$voidedAtRaw drift=$([math]::Round($voidedAtDriftMin, 2)) min"

$voidedOilLine = $detail.Json.data.items | Where-Object { $_.productId -eq $oilId }
Check "Voided line keeps its base/final snapshots and line total" (
  $voidedOilLine.baseUnitPrice -eq "360.00" -and
  $voidedOilLine.finalUnitPrice -eq "320.00" -and
  $voidedOilLine.lineTotal -eq "960.00"
) "got $($voidedOilLine | ConvertTo-Json -Compress)"

Write-Host "`n== Deactivation ==" -ForegroundColor Cyan
$deactivate = Api POST "/api/products/$tireId/deactivate"
Check "Product with history can be deactivated" ($deactivate.Status -eq 200 -and -not $deactivate.Json.data.product.isActive)

$inactiveSale = Api POST "/api/sales" @{
  saleDate = $today; requestId = [guid]::NewGuid().ToString()
  items = @(@{ productId = $tireId; quantity = "1" })
}
Check "Inactive product cannot be sold" ($inactiveSale.Status -eq 409) "got $($inactiveSale.Status)"

$reactivate = Api POST "/api/products/$tireId/activate"
Check "Product can be reactivated" ($reactivate.Json.data.product.isActive -eq $true)

Write-Host "`n== Logout ==" -ForegroundColor Cyan
$logout = Api POST "/api/auth/logout"
$afterLogout = Api GET "/api/products"
Check "Logout invalidates the session" ($logout.Status -eq 200 -and $afterLogout.Status -eq 401)

Write-Host ""
if ($script:Failures -gt 0) {
  Write-Host "$script:Failures of $script:Checks checks FAILED." -ForegroundColor Red
  exit 1
} else {
  Write-Host "All $script:Checks checks passed." -ForegroundColor Green
  exit 0
}
