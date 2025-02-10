import { generateKeyPairSync } from 'crypto'
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export function generateSelfSignedCertificate() {
    // Generate key pair
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    })

    // Create temporary files for OpenSSL
    const tmpDir = tmpdir()
    const keyPath = join(tmpDir, 'server.key')
    const csrPath = join(tmpDir, 'server.csr')
    const certPath = join(tmpDir, 'server.crt')

    try {
        // Write private key to temp file
        writeFileSync(keyPath, privateKey)

        // Generate CSR
        execSync(`openssl req -new -key ${keyPath} -out ${csrPath} -subj "/CN=localhost"`)

        // Generate self-signed certificate
        execSync(`openssl x509 -req -days 365 -in ${csrPath} -signkey ${keyPath} -out ${certPath}`)

        // Read the generated certificate
        const cert = execSync(`cat ${certPath}`).toString()

        return {
            key: privateKey,
            cert
        }
    } finally {
        // Clean up temporary files
        try {
            unlinkSync(keyPath)
            unlinkSync(csrPath)
            unlinkSync(certPath)
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}
