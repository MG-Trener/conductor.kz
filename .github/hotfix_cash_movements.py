from pathlib import Path

path = Path("firestore.rules")
text = path.read_text()

marker = "    function orderMatchesCash(orderId, operationType) {\n"
if "function validCashOperationCreate(orderId, data)" not in text:
    insert = """    function validCashOperationCreate(orderId, data) {
      return data.keys().hasAll([
          'operationType', 'amount', 'cashDelta', 'before', 'after', 'items',
          'total', 'note', 'status', 'source', 'createdAt', 'createdAtClient',
          'createdBy', 'createdByName'
        ])
        && data.keys().hasOnly([
          'operationType', 'amount', 'cashDelta', 'before', 'after', 'items',
          'total', 'note', 'status', 'source', 'createdAt', 'createdAtClient',
          'createdBy', 'createdByName'
        ])
        && data.operationType in ['cash_deposit', 'cash_sawmill']
        && data.amount is int
        && data.amount > 0
        && data.cashDelta is int
        && ((data.operationType == 'cash_deposit' && data.cashDelta == data.amount)
          || (data.operationType == 'cash_sawmill' && data.cashDelta == -data.amount))
        && data.before is number
        && data.before >= 0
        && data.after is number
        && data.after >= 0
        && data.after == data.before + data.cashDelta
        && data.items is list
        && data.items.size() == 0
        && data.total == data.cashDelta
        && data.note is string
        && data.note.size() <= 500
        && data.status == 'done'
        && data.source == 'stock-app'
        && data.createdAt == request.time
        && data.createdAtClient is string
        && data.createdAtClient.size() <= 64
        && data.createdBy == request.auth.uid
        && data.createdByName is string
        && data.createdByName.size() <= 80
        && existsAfter(/databases/$(database)/documents/finance/cash)
        && getAfter(/databases/$(database)/documents/finance/cash).data.balance == data.after
        && getAfter(/databases/$(database)/documents/finance/cash).data.lastOperationType == data.operationType
        && getAfter(/databases/$(database)/documents/finance/cash).data.lastOperationId == orderId
        && getAfter(/databases/$(database)/documents/finance/cash).data.updatedBy == request.auth.uid
        && getAfter(/databases/$(database)/documents/finance/cash).data.updatedAt == request.time;
    }

"""
    if marker not in text:
        raise SystemExit("orderMatchesCash marker not found")
    text = text.replace(marker, insert + marker, 1)

old = "      allow create: if isStaff() && validOrderCreate(request.resource.data);"
new = "      allow create: if isStaff()\n        && (validOrderCreate(request.resource.data)\n          || validCashOperationCreate(orderId, request.resource.data));"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit("orders create rule marker not found")

old_types = "&& data.lastOperationType in ['init', 'sale', 'cancel_sale', 'withdrawal']"
new_types = "&& data.lastOperationType in ['init', 'sale', 'cancel_sale', 'withdrawal', 'cash_deposit', 'cash_sawmill']"
if old_types in text:
    text = text.replace(old_types, new_types, 1)
elif new_types not in text:
    raise SystemExit("cash operation type marker not found")

finance_marker = "    match /finance/{docId} {\n"
if "function cashMatchesManualMovement()" not in text:
    insert = """    function cashMatchesManualMovement() {
      let operation = getAfter(/databases/$(database)/documents/orders/$(cashOperationId(request.resource.data))).data;
      return cashOperationType(request.resource.data) in ['cash_deposit', 'cash_sawmill']
        && operation.operationType == cashOperationType(request.resource.data)
        && operation.createdAt == request.time
        && operation.createdBy == request.auth.uid
        && operation.before == resource.data.balance
        && operation.after == request.resource.data.balance
        && operation.cashDelta == request.resource.data.balance - resource.data.balance
        && ((operation.operationType == 'cash_deposit' && operation.cashDelta > 0)
          || (operation.operationType == 'cash_sawmill' && operation.cashDelta < 0));
    }

"""
    if finance_marker not in text:
        raise SystemExit("finance marker not found")
    text = text.replace(finance_marker, insert + finance_marker, 1)

old_matchers = "&& (cashMatchesSale() || cashMatchesCancellation() || cashMatchesWithdrawal());"
new_matchers = "&& (cashMatchesSale() || cashMatchesCancellation() || cashMatchesWithdrawal() || cashMatchesManualMovement());"
if old_matchers in text:
    text = text.replace(old_matchers, new_matchers, 1)
elif new_matchers not in text:
    raise SystemExit("cash matcher marker not found")

path.write_text(text)
