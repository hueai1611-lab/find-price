# Excel Import Notes

## Source workbook
- File: VH_XD31_VBLQ_Bo don gia (XD)_01.04.2026.xlsx
- Sheet used: BDG (XD)
- Range observed: A1:AD2431

## Header structure
The workbook uses a multi-row header.

### Main columns
- Stt
- CTXD
- Mã hiệu (HSMT)
- Mã hiệu (KSG)
- Nhóm công tác
- Nội dung công việc
- Quy cách kỹ thuật
- Yêu cầu khác
- Đơn vị

### Repeated price groups by quarter
The workbook includes repeated pricing groups for:
- Quý II+III.25
- Quý IV.25
- Quý I.26
- Quý II.26

Each price group contains:
- Vật tư
- Thi công
- Tổng cộng
- Link HĐ tham khảo (CKS)
- Ghi chú

### Other columns
- Người thực hiện

## Row types observed
The sheet contains different row types:
- section rows, e.g. TC.8
- subgroup rows, e.g. 8.1, 8.2
- detail item rows with actual searchable content and units

Import logic must distinguish between:
- section/group rows
- real searchable BOQ items