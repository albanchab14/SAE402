<?php
$d = json_decode(file_get_contents('models.json'), true);
foreach($d['models'] as $m) echo $m['name'] . ', ';
