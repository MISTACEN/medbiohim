<?php
// Canonical MEDBIOHIM import schema. Values are examples only; UUIDs are never required.
$tabs=[
 'README'=>[['MEDBIOHIM Excel import'],['Use stable keys and names. Database UUIDs are generated automatically.']],
 'SUBJECTS'=>[['subject_key','name','code'],['physics','Физика','PHYS']],
 'MODULES'=>[['module_key','subject_key','name'],['mechanics','physics','Механика']],
 'TOPICS'=>[['topic_key','module_key','name'],['kinematics','mechanics','Кинематика']],
 'TESTS'=>[['test_key','title','subject_key','module_key','topic_key','time_limit_sec','max_attempts','is_published'],['physics_01','Кинематика — тест 1','physics','mechanics','kinematics',1800,3,true]],
 'QUESTIONS'=>[['question_key','text','subject_key','module_key','topic_key','type','answer','options','difficulty','is_published'],['physics_q01','Что такое скорость?','physics','mechanics','kinematics','open','Векторная физическая величина', '',2,true]],
 'TEST_QUESTIONS'=>[['test_key','question_key','order_index'],['physics_01','physics_q01',1]],
];
foreach($tabs as $name=>$rows){echo "[$name]\n";foreach($rows as $row){echo implode("\t",$row)."\n";}echo "\n";}
