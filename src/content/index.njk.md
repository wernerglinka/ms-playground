---
title: Hello Title ;-)
layout: simple.njk
pageName: "home"

sections:
  title: A title in the fontmatter sections
  content: |-

    ## A sub title

    Vestibulum id ligula porta felis euismod semper. Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    - Pharetra Ornare
    - Sollicitudin Etiam Fringilla
    - Cras Pharetra

    [Go away](http://apple.com)
---

# Markdown page... testing markdown partials plugin

## empty folder
{{ emptyFolderTest | dump | safe }}
## TOML
{{ tomlTest | dump | safe }}
## External TOML
{{ extTomlTest | dump | safe }}
## YAML
{{ yamlTest | dump | safe }}
## External YAML
{{ extYamlTest | dump | safe }}
## site
{{ site | dump | safe }}
## local file
{{ jsonTest | dump | safe }}
## local folder
{{ jsonFolderTest | dump | safe }}
## ext file
{{ extJsonTest | dump | safe }}
## ext file2
{{ extJsonTest2 | dump | safe }}
## ext folder
{{ extJsonTestFolder | dump | safe }}
## ext folder 2
{{ extJsonTestFolder2 | dump | safe }}
## ext folder 3
{{ extJsonTestFolder3 | dump | safe }}

Nullam quis risus eget urna mollis ornare vel eu leo. Curabitur blandit tempus porttitor. Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Donec sed odio dui.

{#md "test-partial.md" #}

Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Nulla vitae elit libero, a pharetra augue. Maecenas faucibus mollis interdum. Maecenas faucibus mollis interdum. Sed posuere consectetur est at lobortis.

{#md "another-test-partial.md" #}

Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Aenean eu leo quam. Pellentesque ornare sem lacinia quam venenatis vestibulum. Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Aenean lacinia bibendum nulla sed consectetur.