from pathlib import Path
import re

path = Path("firestore.rules")
text = path.read_text()

old = "        && validModelId(data.modelId)\n"
new = "        && modelExists(data.modelId)\n"
if text.count(old) != 1:
    raise SystemExit(f"expected one validModelId(data.modelId) guard, found {text.count(old)}")
text = text.replace(old, new, 1)


def replace_function(name, replacement):
    global text
    pattern = re.compile(rf"    function {re.escape(name)}\([^\n]*\) \{{.*?^    \}}", re.M | re.S)
    text, count = pattern.subn(replacement.rstrip(), text, count=1)
    if count != 1:
        raise SystemExit(f"could not replace Firestore function {name}")


replace_function("linkedProductMovement", '''    function linkedProductMovement(productId, before, after) {
      let movement = getAfter(/databases/$(database)/documents/stockMovements/$(request.resource.data.lastMovementId)).data;
      return request.resource.data.keys().hasAny(['lastMovementId'])
        && validOperationId(request.resource.data.lastMovementId)
        && movement.inventoryId == productId
        && movement.productId == request.resource.data.modelId
        && movement.before == before
        && movement.after == after
        && movement.qtyDelta == after - before
        && movement.createdBy == request.auth.uid
        && movement.createdAt == request.time;
    }''')

replace_function("orderMatchesCash", '''    function orderMatchesCash(orderId, operationType) {
      let cash = getAfter(/databases/$(database)/documents/finance/cash).data;
      return cash.lastOperationType == operationType
        && cash.lastOperationId == orderId
        && cash.updatedBy == request.auth.uid
        && cash.updatedAt == request.time;
    }''')

replace_function("cashMatchesSale", '''    function cashMatchesSale() {
      let order = getAfter(/databases/$(database)/documents/orders/$(cashOperationId(request.resource.data))).data;
      return cashOperationType(request.resource.data) == 'sale'
        && order.status == 'done'
        && order.createdAt == request.time
        && order.createdBy == request.auth.uid
        && request.resource.data.balance == resource.data.balance + order.total;
    }''')

replace_function("cashMatchesCancellation", '''    function cashMatchesCancellation() {
      let order = getAfter(/databases/$(database)/documents/orders/$(cashOperationId(request.resource.data))).data;
      return cashOperationType(request.resource.data) == 'cancel_sale'
        && order.status == 'cancelled'
        && order.cancelledAt == request.time
        && order.cancelledBy == request.auth.uid
        && request.resource.data.balance == resource.data.balance - order.total;
    }''')

replace_function("cashMatchesWithdrawal", '''    function cashMatchesWithdrawal() {
      let withdrawal = getAfter(/databases/$(database)/documents/cashWithdrawals/$(cashOperationId(request.resource.data))).data;
      return cashOperationType(request.resource.data) == 'withdrawal'
        && withdrawal.createdAt == request.time
        && withdrawal.createdBy == request.auth.uid
        && withdrawal.before == resource.data.balance
        && withdrawal.after == request.resource.data.balance
        && request.resource.data.balance == resource.data.balance - withdrawal.amount;
    }''')

replace_function("withdrawalMatchesCash", '''    function withdrawalMatchesCash(withdrawalId, data) {
      let cash = getAfter(/databases/$(database)/documents/finance/cash).data;
      return cash.lastOperationType == 'withdrawal'
        && cash.lastOperationId == withdrawalId
        && cash.balance == data.after
        && cash.updatedBy == request.auth.uid
        && cash.updatedAt == request.time;
    }''')

path.write_text(text)
