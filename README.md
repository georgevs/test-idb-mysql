# Test IDB and MySQL

## Run the database
```
docker container run --rm -d \
  --name test-db \
  --network bridge-sba-opx \
  --ip 172.18.0.201 \
  --volume "$PWD/mysql:/var/lib/mysql" \
  --env MYSQL_ROOT_PASSWORD=LikeBeingThere \
  mysql

mysql_config_editor set --host=172.18.0.201 --port=3306 --user=root --password

mysql < db.sql
```

## Run the backend
```
docker container run --rm -d \
  --name test-backend \
  --network bridge-sba-opx \
  --ip 172.18.0.202 \
  --user node \
  --workdir /home/node/app \
  --volume "$PWD:/home/node/app" \
  node server
```

## Run the app
```
docker container run --rm -d \
  --name test-app \
  --network bridge-sba-opx \
  --ip 172.18.0.203 \
  --user node \
  --workdir /home/node/app \
  --volume "$PWD:/home/node/app" \
  node npx http-server . -c-1 -p 8080
```
