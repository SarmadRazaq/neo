/**
 * CUA Tools Test Script
 * Run with: npx ts-node test-cua.ts
 */

import { browserManager } from './src/main/cua/browserManager';

async function testOnWikipedia() {
  console.log('CUA Tools Test Suite');
  console.log('==================================================\n');

  try {
    // Test 1: Navigate
    console.log('[1/7] Navigate to Wikipedia...');
    const navResult = await browserManager.navigate('https://en.wikipedia.org');
    console.log('      Result:', navResult.success ? 'OK' : `FAILED: ${navResult.error}`);

    await new Promise(r => setTimeout(r, 1000));

    // Test 2: Screenshot (initial)
    console.log('\n[2/7] Take initial screenshot...');
    const ss1 = await browserManager.screenshot();
    console.log('      Result:', ss1.success ? 'OK' : `FAILED: ${ss1.error}`);
    if (ss1.data) {
      console.log('      Size:', ss1.data.length, 'chars (base64)');
      console.log('      Dimensions:', `${ss1.width}x${ss1.height}`);
      
      const fs = await import('fs');
      const buffer = Buffer.from(ss1.data, 'base64');
      fs.writeFileSync('test-screenshot-1.png', buffer);
      console.log('      Saved to: test-screenshot-1.png');
    }

    // Test 3: Click the search box
    console.log('\n[3/7] Click search box at (640, 46)...');
    const clickResult = await browserManager.click(640, 46);
    console.log('      Result:', clickResult.success ? 'OK' : `FAILED: ${clickResult.error}`);

    // Test 4: Type search query
    console.log('\n[4/7] Type "artificial intelligence"...');
    const typeResult = await browserManager.type('artificial intelligence');
    console.log('      Result:', typeResult.success ? 'OK' : `FAILED: ${typeResult.error}`);

    // Test 5: Press Enter
    console.log('\n[5/7] Press Enter key...');
    const keyResult = await browserManager.keyPress('Enter');
    console.log('      Result:', keyResult.success ? 'OK' : `FAILED: ${keyResult.error}`);

    await new Promise(r => setTimeout(r, 2000));

    // Test 6: Get browser state
    console.log('\n[6/7] Get browser state...');
    const url = await browserManager.getCurrentUrl();
    const title = await browserManager.getPageTitle();
    const viewport = browserManager.getViewport();
    console.log('      URL:', url);
    console.log('      Title:', title);
    console.log('      Viewport:', `${viewport.width}x${viewport.height}`);
    console.log('      Active:', browserManager.isActive());

    // Test 7: Screenshot (final)
    console.log('\n[7/7] Take final screenshot...');
    const ss2 = await browserManager.screenshot();
    console.log('      Result:', ss2.success ? 'OK' : `FAILED: ${ss2.error}`);
    if (ss2.data) {
      console.log('      Size:', ss2.data.length, 'chars (base64)');
      
      const fs = await import('fs');
      const buffer = Buffer.from(ss2.data, 'base64');
      fs.writeFileSync('test-screenshot-2.png', buffer);
      console.log('      Saved to: test-screenshot-2.png');
    }

    console.log('\n==================================================');
    console.log('All tests completed.');

  } catch (error) {
    console.error('\nTest failed with error:', error);
  } finally {
    console.log('\nClosing browser...');
    await browserManager.close();
    console.log('Done.\n');
  }
}

testOnWikipedia();
