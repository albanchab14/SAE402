<?php
$k = 'AIzaSyAckn2WK1z1GNE5YltB87veCy5YszU6008';
$c = curl_init('https://generativelanguage.googleapis.com/v1beta/models?key=' . $k);
curl_setopt($c, CURLOPT_RETURNTRANSFER, true);
curl_setopt($c, CURLOPT_SSL_VERIFYPEER, false);
$r = curl_exec($c);
file_put_contents('models_utf8.log', $r);
echo "done";
