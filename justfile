bump:
    npm run build
    npm run test
    npm version patch
    npm login
    npm publish
    git push origin
    git push origin --tags
