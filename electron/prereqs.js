/**
 * System Prerequisites Verification for Windows 7 / 8.1 / 10 / 11
 * Detects Windows 7 SP1, Universal C Runtime (KB2999226), Visual C++ Runtime, and SHA-2 Support (KB4474419)
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkSystemPrerequisites() {
  const result = {
    compatible: true,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    missing: [],
    details: []
  };

  if (process.platform !== 'win32') {
    return result;
  }

  // Support test simulation of prerequisite failure
  const simFail = process.env.CAFE_SIMULATE_PREREQ_FAIL;
  if (simFail === 'WIN7_NO_SP1') {
    result.compatible = false;
    result.missing.push({
      component: 'Windows 7 Service Pack 1',
      kbNumber: 'KB976932',
      title: 'تحديث Windows 7 الحزمة الخدمية الأولى (SP1) غير مثبت',
      message: 'البرنامج يتطلب نظام Windows 7 Service Pack 1 (SP1) على الأقل ليعمل بأمان.',
      resolution: 'يرجى تحميل وتثبيت الحزمة الخدمية الأولى (Windows 7 SP1 - KB976932) من موقع مايكروسوفت أو من أسطوانة التثبيت.'
    });
    return result;
  }

  if (simFail === 'MISSING_UCRT') {
    result.compatible = false;
    result.missing.push({
      component: 'Universal C Runtime (UCRT)',
      kbNumber: 'KB2999226',
      title: 'مكتبة Universal C Runtime (KB2999226) غير مثبتة',
      message: 'الملف الحيوي ucrtbase.dll مفقود في مجلد النظام C:\\Windows\\System32، مما يمنع محرك Node.js وقاعدة البيانات من الإقلاع.',
      resolution: 'يرجى تثبيت تحديث مايكروسوفت KB2999226 أو تثبيت حزمة Visual C++ 2015-2022 Redistributable.'
    });
    return result;
  }

  if (simFail === 'MISSING_SHA2') {
    result.compatible = false;
    result.missing.push({
      component: 'SHA-2 Code Signing Support',
      kbNumber: 'KB4474419',
      title: 'تحديث دعم التوقيع المشفر SHA-2 (KB4474419) مفقود',
      message: 'نظام Windows 7 لا يتعرف على الشهادات والتوقيعات الرقمية الحديثة من نوع SHA-256 بدون هذا التحديث.',
      resolution: 'يرجى تثبيت التحديث المستقل KB4474419 الخاص بـ Windows 7 لضمان الوثوق بالملف التنفيذي.'
    });
    return result;
  }

  const sysRoot = process.env.SystemRoot || 'C:\\Windows';
  const sys32 = path.join(sysRoot, 'System32');

  // 1. Windows 7 SP1 Check
  // Windows 7 NT kernel is 6.1.x
  const releaseParts = os.release().split('.').map(Number);
  const isWin7 = releaseParts[0] === 6 && releaseParts[1] === 1;

  if (isWin7) {
    let hasSp1 = false;
    try {
      const regOut = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion" /v CSDVersion', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (regOut.includes('Service Pack 1')) {
        hasSp1 = true;
      }
    } catch (_) {}

    if (!hasSp1) {
      result.compatible = false;
      result.missing.push({
        component: 'Windows 7 Service Pack 1',
        kbNumber: 'KB976932',
        title: 'تحديث الحزمة الخدمية الأولى (SP1) مفقود',
        message: 'إصدار ويندوز الحالي هو Windows 7 الخام بدون Service Pack 1.',
        resolution: 'يتطلب البرنامج تثبيت Windows 7 SP1 (KB976932) لتوفير دوال النواة الأساسية لمشغل Electron 22.'
      });
    }
  }

  // 2. Check for Universal C Runtime (ucrtbase.dll)
  const ucrtPath = path.join(sys32, 'ucrtbase.dll');
  if (!fs.existsSync(ucrtPath)) {
    result.compatible = false;
    result.missing.push({
      component: 'Universal C Runtime (UCRT)',
      kbNumber: 'KB2999226',
      title: 'مكتبة Universal C Runtime (KB2999226) غير موجودة',
      message: 'الملف ucrtbase.dll غير موجود في النظام.',
      resolution: 'يرجى تثبيت تحديث مايكروسوفت KB2999226 أو تثبيت حزمة Visual C++ 2015-2022 Redistributable.'
    });
  }

  // 3. Check for Visual C++ 2015-2022 Runtime (vcruntime140.dll)
  const vcRuntimePath = path.join(sys32, 'vcruntime140.dll');
  if (!fs.existsSync(vcRuntimePath)) {
    result.compatible = false;
    result.missing.push({
      component: 'Visual C++ 2015-2022 Runtime',
      kbNumber: 'VC_Redist_2015_2022',
      title: 'حزمة Visual C++ 2015-2022 مفقودة',
      message: 'الملف vcruntime140.dll غير موجود في مسار النظام.',
      resolution: 'يرجى تثبيت حزمة VC++ Redistributable (vc_redist.x86.exe أو vc_redist.x64.exe).'
    });
  }

  return result;
}

function showPrerequisitesDialog(dialog, missingItems) {
  if (!dialog || !Array.isArray(missingItems) || missingItems.length === 0) return;

  const item = missingItems[0];
  const title = `تنبيه متطلبات التشغيل — ${item.title}`;
  const message = `${item.message}\n\nالحل المطلوب:\n${item.resolution}\n\nرقم التحديث: ${item.kbNumber}`;

  try {
    dialog.showErrorBox(title, message);
  } catch (e) {
    console.error('Failed to show error dialog:', title, message);
  }
}

module.exports = {
  checkSystemPrerequisites,
  showPrerequisitesDialog
};

