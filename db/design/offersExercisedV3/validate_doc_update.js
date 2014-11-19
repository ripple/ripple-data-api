function(newDoc, oldDoc, userCtx, secObj) {
    if (userCtx && userCtx.roles && (userCtx.roles.indexOf('_admin') !== -1 ||
        userCtx.roles.indexOf('write') !== -1)) {
        return;
    } else {
        throw ({
            forbidden: 'You do not have write access to this database'
        });
    }
}