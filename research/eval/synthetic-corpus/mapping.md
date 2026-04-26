# CellSentry pseudonym map (synthetic corpus, eval-only)
# All names below are SYNTHETIC test fixtures — no real PII.
version: 1
next_pseudonym_index: 8
patients:
  - patient_id: synthetic-001
    real_name: 测试人甲
    aliases: []
    pseudonym: 患者A
    date_mode: preserve
    additional_entities: []

  - patient_id: synthetic-002
    real_name: John Doe-Test
    aliases: [Dr. Test-Consultant]
    pseudonym: Patient B
    date_mode: preserve
    additional_entities: []

  - patient_id: synthetic-003
    real_name: 测试人乙
    aliases: []
    pseudonym: 患者C
    date_mode: preserve
    additional_entities:
      - real: 测试人丙
        pseudonym: 家属C1
      - real: 测试医师
        pseudonym: 主治医师X

  - patient_id: synthetic-004
    real_name: 测试人丁
    aliases: []
    pseudonym: 患者D
    date_mode: preserve
    additional_entities:
      - real: 王医生
        pseudonym: 医师Y

  - patient_id: synthetic-005
    real_name: Jane Test-Patient
    aliases: [Dr. Test-Therapist]
    pseudonym: Patient E
    date_mode: preserve
    additional_entities: []

  - patient_id: synthetic-006
    real_name: 测试人戊
    aliases: []
    pseudonym: 患者F
    date_mode: preserve
    additional_entities:
      - real: 张医生
        pseudonym: 医师Z
