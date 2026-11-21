const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'src', 'App.jsx');
let s = fs.readFileSync(p, 'utf8');

const targetRegex = /<select\s+value=\{userForm\.shift_name\}[\s\S]*?<\/select>/;
const replacement = `<select
                  value={userForm.shift_name}
                  onChange={(e) => {
                    const val = e.target.value;
                    const matched = shiftSchedules.find((sch) => sch.name === val || \`\${sch.name} (\${sch.start} - \${sch.end})\` === val);
                    let sStart = matched ? matched.start : '08:00';
                    let sEnd = matched ? matched.end : '16:00';
                    if (val.includes('جميع الأوقات')) {
                      sStart = '00:00';
                      sEnd = '23:59';
                    }
                    setUserForm({
                      ...userForm,
                      shift_name: val,
                      shift_start: sStart,
                      shift_end: sEnd
                    });
                  }}
                >
                  {shiftSchedules.map((sch) => (
                    <option key={sch.id} value={\`\${sch.name} (\${sch.start} - \${sch.end})\`}>
                      {sch.icon || '⏰'} {sch.name} ({sch.start} - {sch.end})
                    </option>
                  ))}
                  <option value="جميع الأوقات (مدير)">👑 جميع الأوقات (مدير عام 00:00 - 23:59)</option>
                  <option value="شيفت مخصص">⚙️ شيفت مخصص (تحديد يدوي)</option>
                </select>`;

s = s.replace(targetRegex, replacement);
fs.writeFileSync(p, s, 'utf8');
console.log('User modal shift select updated successfully!');
