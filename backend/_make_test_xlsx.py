from openpyxl import Workbook
from django.conf import settings
import os

wb = Workbook()
ws = wb.active
ws.title = 'Sales'
ws.append(['Region', 'Product', 'Q1 Revenue', 'Q2 Revenue'])
ws.append(['North', 'Widget A', 12000, 15000])
ws.append(['South', 'Widget B', 8000, 9500])
ws.append(['East', 'Widget C', 21000, 19000])

out_dir = os.path.join(settings.MEDIA_ROOT, 'tmp_test')
os.makedirs(out_dir, exist_ok=True)
path = os.path.join(out_dir, 'sales_test.xlsx')
wb.save(path)
print('saved to', path)
print('media url would be', settings.MEDIA_URL + 'tmp_test/sales_test.xlsx')
