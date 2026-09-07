from pathlib import Path
import re

rules_path = Path("firestore.rules")
text = rules_path.read_text()


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

replace_function("validOrderCancel", '''    function validOrderCancel(orderId) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
          'status', 'cancelledAt', 'cancelledBy', 'cancelledByName'
        ])
        && request.resource.data.status == 'cancelled'
        && resource.data.status == 'done'
        && request.resource.data.cancelledAt == request.time
        && request.resource.data.cancelledBy == request.auth.uid
        && request.resource.data.cancelledByName is string
        && request.resource.data.cancelledByName.size() <= 80;
    }''')

orders_old = '''      allow create: if isStaff()
        && validOrderCreate(request.resource.data)
        && orderMatchesCash(orderId, 'sale');
      allow update: if isStaff() && validOrderCancel(orderId);'''
orders_new = '''      allow create: if isStaff() && validOrderCreate(request.resource.data);
      allow update: if isStaff() && validOrderCancel(orderId);'''
if text.count(orders_old) != 1:
    raise SystemExit(f"expected one cyclic order guard, found {text.count(orders_old)}")
text = text.replace(orders_old, orders_new, 1)

movement_anchor = '''    function validMovementType(value) {
      return value in ['receipt', 'writeoff', 'adjustment', 'sale', 'sale_return'];
    }

    function validMovement(data) {'''
movement_replacement = '''    function validMovementType(value) {
      return value in ['receipt', 'writeoff', 'adjustment', 'sale', 'sale_return'];
    }

    function linkedMovementOrder(data) {
      let order = getAfter(/databases/$(database)/documents/orders/$(data.orderId)).data;
      return validOperationId(data.orderId)
        && ((data.type == 'sale'
            && order.status == 'done'
            && order.createdAt == request.time
            && order.createdBy == request.auth.uid)
          || (data.type == 'sale_return'
            && order.status == 'cancelled'
            && order.cancelledAt == request.time
            && order.cancelledBy == request.auth.uid));
    }

    function validMovement(data) {'''
if text.count(movement_anchor) != 1:
    raise SystemExit("movement order helper anchor not found")
text = text.replace(movement_anchor, movement_replacement, 1)

sale_guard_old = '''        && (data.type != 'sale' || (data.keys().hasAll(['salePrice', 'orderId']) && data.orderId.size() > 0))
        && (data.type != 'sale_return' || (data.keys().hasAll(['orderId']) && data.orderId.size() > 0))'''
sale_guard_new = '''        && (data.type != 'sale' || (data.keys().hasAll(['salePrice', 'orderId']) && data.orderId.size() > 0 && linkedMovementOrder(data)))
        && (data.type != 'sale_return' || (data.keys().hasAll(['orderId']) && data.orderId.size() > 0 && linkedMovementOrder(data)))'''
if text.count(sale_guard_old) != 1:
    raise SystemExit("sale movement order guard not found")
text = text.replace(sale_guard_old, sale_guard_new, 1)

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

rules_path.write_text(text)

public_test_path = Path("tests/public-prices-pages.test.mjs")
public_tests = public_test_path.read_text()
old_assertion = '  assert.match(rules, /modelExists\\(data\\.modelId\\)/);\n'
new_assertion = '  assert.match(rules, /modelExists\\(request\\.resource\\.data\\.modelId\\)/);\n'
if public_tests.count(old_assertion) != 1:
    raise SystemExit(f"expected one catalogue-backed rules assertion, found {public_tests.count(old_assertion)}")
public_test_path.write_text(public_tests.replace(old_assertion, new_assertion, 1))
