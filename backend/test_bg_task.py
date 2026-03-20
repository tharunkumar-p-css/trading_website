import urllib.request
import json
import time

try:
    data = b'username=test@user.com&password=password123'
    req = urllib.request.Request('http://127.0.0.1:8000/auth/token', data=data, method='POST')
    res = urllib.request.urlopen(req)
    token = json.loads(res.read())['access_token']
    print('Token obtained')

    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    money_data = json.dumps({'amount': 50000, 'upi_id': 'test@upi'}).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:8000/payments/add-money', data=money_data, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    print('Money added')

    order_data = json.dumps({'symbol': 'AAPL', 'order_type': 'MARKET', 'side': 'BUY', 'quantity': 1}).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:8000/trade/order', data=order_data, headers=headers, method='POST')
    res = urllib.request.urlopen(req)
    print('Order placed:', res.read().decode())
    
    print('Waiting 4s...')
    time.sleep(4)
    
    req = urllib.request.Request('http://127.0.0.1:8000/trade/orders', headers=headers, method='GET')
    res = urllib.request.urlopen(req)
    print('Orders:', res.read().decode())

    req = urllib.request.Request('http://127.0.0.1:8000/trade/portfolio', headers=headers, method='GET')
    res = urllib.request.urlopen(req)
    print('Portfolio:', res.read().decode())

except Exception as e:
    print('Error:', e)
    if hasattr(e, 'read'):
        print(e.read().decode())
