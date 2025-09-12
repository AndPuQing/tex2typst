bump:
    npm run build
    npm run test
    npm version patch
    npm publish
    git push origin
    git push origin --tags
