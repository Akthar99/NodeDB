// scripts/release.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class ReleaseManager {
  constructor() {
    this.version = require('../package.json').version;
  }

  validateRelease() {
    console.log('🔍 Validating release...');
    
    // Check if working directory is clean
    try {
      execSync('git diff-index --quiet HEAD --', { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Working directory is not clean. Commit changes first.');
      process.exit(1);
    }

    // Run tests
    console.log('🧪 Running tests...');
    execSync('npm test', { stdio: 'inherit' });

    // Run performance tests
    console.log('⚡ Running performance tests...');
    execSync('npm run test:performance', { stdio: 'inherit' });

    console.log('✅ Release validation passed');
  }

  updateVersion(newVersion) {
    console.log(`📦 Updating version to ${newVersion}...`);
    
    // Update package.json
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    packageJson.version = newVersion;
    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

    // Update CLI version display
    const cliPath = path.join(__dirname, '../bin/db-cli.js');
    let cliContent = fs.readFileSync(cliPath, 'utf8');
    cliContent = cliContent.replace(
      /const packageJson = require\(['"]\.\.\/package\.json['"]\);/,
      `const packageJson = require('../package.json');`
    );
    fs.writeFileSync(cliPath, cliContent);

    // Commit version update
    execSync(`git add package.json bin/db-cli.js`, { stdio: 'inherit' });
    execSync(`git commit -m "chore: release v${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    console.log(`✅ Version updated to ${newVersion}`);
  }

  createRelease() {
    console.log('🚀 Creating release...');
    
    // Push to GitHub
    execSync('git push origin main --tags', { stdio: 'inherit' });
    
    // Create npm package
    execSync('npm pack', { stdio: 'inherit' });
    
    console.log('🎉 Release created successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Go to https://github.com/yourusername/nodejs-database/releases');
    console.log('2. Edit the new release');
    console.log('3. Add release notes');
    console.log('4. Publish the release');
  }

  run() {
    const args = process.argv.slice(2);
    const command = args[0];
    const version = args[1];

    switch (command) {
      case 'validate':
        this.validateRelease();
        break;
      case 'version':
        if (!version) {
          console.error('❌ Please provide a version number');
          process.exit(1);
        }
        this.validateRelease();
        this.updateVersion(version);
        break;
      case 'release':
        this.validateRelease();
        this.createRelease();
        break;
      default:
        console.log('Usage:');
        console.log('  node scripts/release.js validate        # Validate release');
        console.log('  node scripts/release.js version 1.1.0   # Update version');
        console.log('  node scripts/release.js release         # Create release');
        process.exit(1);
    }
  }
}

const releaseManager = new ReleaseManager();
releaseManager.run();