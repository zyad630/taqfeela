const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'node_modules', 'expo-sqlite', 'android', 'build.gradle');

if (!fs.existsSync(targetFile)) {
  console.log('[patch-sqlite] expo-sqlite build.gradle not found, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(targetFile, 'utf8');

const oldPattern = /def downloadSQLite = tasks\.register\('downloadSQLite'[\s\S]*?into\(SQLITE3_SRC_DIR\)[\s\S]*?file\.path = file\.name[\s\S]*?\}\s*\}/;

const newTask = `def downloadSQLite = tasks.register('downloadSQLite') {
  dependsOn(createNativeDepsDirectories)
  doLast {
    def localZip1 = new File(project.rootDir, "../downloads/sqlite-amalgamation-\${SQLITE_VERSION}.zip")
    def localZip2 = new File(projectDir, "../../../downloads/sqlite-amalgamation-\${SQLITE_VERSION}.zip")
    def destFile = new File(downloadsDir, "sqlite-amalgamation-\${SQLITE_VERSION}.zip")
    if (localZip1.exists()) {
      println "[expo-sqlite] Using bundled SQLite from: " + localZip1.absolutePath
      copy {
        from localZip1
        into downloadsDir
      }
    } else if (localZip2.exists()) {
      println "[expo-sqlite] Using bundled SQLite from: " + localZip2.absolutePath
      copy {
        from localZip2
        into downloadsDir
      }
    } else {
      println "[expo-sqlite] Downloading SQLite from fallback URL"
      download.run {
        src("https://www.sqlite.org/2024/sqlite-amalgamation-\${SQLITE_VERSION}.zip")
        onlyIfNewer(true)
        overwrite(false)
        dest(destFile)
      }
    }
  }
}

def prepareSQLite = tasks.register("prepareSQLite", Copy) {
  dependsOn(downloadSQLite)
  from(zipTree(new File(downloadsDir, "sqlite-amalgamation-\${SQLITE_VERSION}.zip")))
  into(SQLITE3_SRC_DIR)
  eachFile { file ->
    // flatten files
    file.path = file.name
  }
}`;

if (oldPattern.test(content)) {
  content = content.replace(oldPattern, newTask);
  fs.writeFileSync(targetFile, content, 'utf8');
  console.log('[patch-sqlite] Successfully patched expo-sqlite build.gradle with bundled offline SQLite!');
} else {
  console.log('[patch-sqlite] Pattern not found (may already be patched).');
}
