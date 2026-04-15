import glob

for filepath in glob.glob('pages/admin/*.html'):
    with open(filepath, 'r') as fh:
        content = fh.read()
    
    old = '<a href="../../index.html" class="side-signout">Sign Out</a>'
    new = '<a href="#" onclick="fetch(\'/api/auth/logout\',{method:\'POST\'}).finally(()=>{window.location.href=\'/index.html\';})" class="side-signout">Sign Out</a>'
    
    if old in content:
        content = content.replace(old, new)
        with open(filepath, 'w') as fh:
            fh.write(content)
        print('Fixed signout in', filepath)
