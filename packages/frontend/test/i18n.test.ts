import { beforeAll, describe, expect, it } from 'vitest';
import i18n from '../src/i18n/index.js';

describe('i18n', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates common.save in English', () => {
    expect(i18n.t('save', { ns: 'common' })).toBe('Save');
  });

  it('translates approval.approve in English', () => {
    expect(i18n.t('approve', { ns: 'approval' })).toBe('Approve');
  });

  it('switches to zh-CN', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('save', { ns: 'common' })).toBe('保存');
    expect(i18n.t('approve', { ns: 'approval' })).toBe('批准');
  });
});
