import ldap from 'ldapjs';

/**
 * Authenticates a user against an LDAP/Active Directory server
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<{dn: string, username: string, displayName: string, groups: string[]}>}
 */
export function authenticateLdap(username, password) {
  return new Promise((resolve, reject) => {
    if (!username || !password) {
      return reject(new Error('Username and password are required'));
    }

    const ldapUrl = process.env.LDAP_URL || 'ldap://localhost:389';
    const baseDn = process.env.LDAP_BASE_DN || 'dc=example,dc=org';
    const bindDn = process.env.LDAP_BIND_DN; // Optional search binder
    const bindPassword = process.env.LDAP_BIND_PASSWORD;
    const isAd = process.env.LDAP_IS_AD === 'true';
    
    let client;
    try {
      client = ldap.createClient({
        url: ldapUrl,
        timeout: 5000,
        connectTimeout: 5000
      });
    } catch (err) {
      return reject(err);
    }

    client.on('error', (err) => {
      // Suppress or handle connection errors gracefully
      console.error('LDAP Client Error:', err);
    });

    const searchAndAuthenticate = () => {
      const filter = isAd 
        ? `(|(sAMAccountName=${username})(userPrincipalName=${username}))`
        : `(|(uid=${username})(cn=${username}))`;
        
      client.search(baseDn, {
        filter: filter,
        scope: 'sub',
        attributes: ['dn', 'cn', 'memberOf']
      }, (err, res) => {
        if (err) {
          client.destroy();
          return reject(err);
        }

        let userEntry = null;

        res.on('searchEntry', (entry) => {
          userEntry = entry.object;
        });

        res.on('error', (searchErr) => {
          client.destroy();
          reject(searchErr);
        });

        res.on('end', (result) => {
          if (!userEntry) {
            client.destroy();
            return reject(new Error('User not found in directory'));
          }

          // Bind with user's exact DN and password to verify password
          let userClient;
          try {
            userClient = ldap.createClient({
              url: ldapUrl,
              timeout: 5000,
              connectTimeout: 5000
            });
          } catch (connErr) {
            client.destroy();
            return reject(connErr);
          }

          userClient.on('error', (connErr) => {
            console.error('LDAP User Client Error:', connErr);
          });

          userClient.bind(userEntry.dn, password, (bindErr) => {
            userClient.destroy();
            client.destroy();

            if (bindErr) {
              return reject(new Error('Invalid credentials'));
            }

            // Extract groups
            let groups = [];
            if (userEntry.memberOf) {
              groups = Array.isArray(userEntry.memberOf) 
                ? userEntry.memberOf 
                : [userEntry.memberOf];
            }

            resolve({
              dn: userEntry.dn,
              username: username,
              displayName: userEntry.cn || username,
              groups: groups
            });
          });
        });
      });
    };

    if (bindDn && bindPassword) {
      client.bind(bindDn, bindPassword, (err) => {
        if (err) {
          client.destroy();
          return reject(err);
        }
        searchAndAuthenticate();
      });
    } else {
      searchAndAuthenticate();
    }
  });
}
